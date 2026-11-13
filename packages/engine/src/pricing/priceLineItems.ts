import type {
  EngineError,
  Labor,
  LineItem,
  PriceLineItemsOptions,
  PriceLineItemsResult,
  PriceRow,
  RefData,
} from '../types';
import { getLookups, isValidNumber, toDate, toEngineError } from '../util';
import { getHvacSystemType } from './hvacSystemType';

/** Pricing structure (UI "PricingStructure" component) -> prices_new.territory. */
export const TERRITORY_BY_STRUCTURE: Record<string, string> = {
  standard: 'CO',
  ma_forge: 'MA',
  ma_laminar: 'MA-Laminar',
  la_standard: 'CA',
  ichoosr_2026: 'iChoosr26',
};

/** `prices_all` SQL: active_date <= d AND (inactive_date IS NULL OR inactive_date > d). */
export function filterActivePrices(prices: PriceRow[], at: Date): PriceRow[] {
  const t = at.getTime();
  return prices.filter((p) => {
    const a = toDate(p.active_date);
    if (!a || a.getTime() > t) return false;
    if (p.inactive_date === null || p.inactive_date === undefined) return true;
    const i = toDate(p.inactive_date);
    return !!i && i.getTime() > t;
  });
}

/**
 * Port of the `priceLineItems` block (both workflow variants).
 *
 * - Finds the price row for each equipment / labor / maintenance-plan line item (territory from the
 *   pricing structure, ducted/ductless/mixed system type, effective date), multiplies by `quantity`
 *   (default 1) and writes `price_actual`.
 * - Circuit labor (labor.subcategory === 'circuit') is priced as
 *   `firstCircuitAdder + min(base + perFt * length, base.circuit_price_limit)`; the first-circuit adder
 *   is applied once per call, to the first circuit that prices successfully.
 * - Per-item failures do NOT abort: the item keeps its previous `price_actual` and an error is
 *   appended to `errors` (the original set `e.fail = false`).
 * - Fatal problems (`lineItems` not an array, unknown equipment while deriving the system type,
 *   no effective date/now) return `{ ok:false, errors }`.
 *
 * Input items are not mutated; priced copies are returned in the same order.
 *
 * Deliberate deviation from the Retool block: line items with no labor_id/equipment_id/
 * maintenance_plan_id and type != 'discount' (permits, incentives, ...) keep their `price_actual`
 * instead of becoming NaN.
 */
export function priceLineItems(
  lineItems: LineItem[],
  refData: Pick<RefData, 'equipment' | 'labor' | 'prices'>,
  opts: PriceLineItemsOptions,
): PriceLineItemsResult {
  try {
    if (!lineItems || !Array.isArray(lineItems)) throw new Error('lineItemArray is not an array or is undefined');

    const pricingStructure = opts.pricingStructure;
    const effective = toDate(opts.pricingEffectiveDate) ?? toDate(opts.now ?? undefined);
    if (!effective) {
      throw new Error('priceLineItems: either opts.pricingEffectiveDate or opts.now must be provided');
    }
    const pricesData = filterActivePrices(refData.prices, effective);
    const { equipmentById, laborById } = getLookups(refData);

    const systemType = opts.systemType !== undefined ? opts.systemType : getHvacSystemType(lineItems, equipmentById);

    const errors: EngineError[] = [];
    let isFirstCircuit = true;

    function getPrices(prices: PriceRow[], type: string, item: LineItem): PriceRow[] {
      const territory = TERRITORY_BY_STRUCTURE[String(pricingStructure)];
      if (!territory) {
        throw new Error(
          pricingStructure + ' is not a valid pricing structure. Check the PricingStructure component state.',
        );
      }
      prices = prices.filter((p) => p.territory === territory);
      let returnVal = prices.filter((p) => (p.system_type ?? null) === systemType);
      // If price not found for this system type (equipment for example) do it with no system type
      if (returnVal.length === 0) returnVal = prices.filter((p) => (p.system_type ?? null) === null);

      if (returnVal.length === 0) {
        let errorMessage = 'No price found for ';
        if (type === 'labor' || type === 'circuit') errorMessage += 'labor id ' + item?.labor_id;
        else if (type === 'equipment') errorMessage += 'equipment id ' + item?.equipment_id;
        else if (type === 'mp') errorMessage += 'maintenance plan id ' + item?.maintenance_plan_id;
        else errorMessage += 'line item ' + JSON.stringify(item);
        throw new Error(errorMessage);
      }
      return returnVal;
    }

    function getPrice(prices: PriceRow[], type: string, item: LineItem): number | string {
      const found = getPrices(prices, type, item);
      if (found.length > 1) {
        throw new Error(
          'duplicate prices found - ids: ' + JSON.stringify(found.map((r) => r.id)) + 'Pricing structure: ' + pricingStructure,
        );
      }
      return found[0].price;
    }

    function getCircuitPrice(prices: PriceRow[], item: LineItem): number {
      prices = getPrices(prices, 'circuit', item);
      // Circuits have 4 prices each - base, per-ft-easy, per-ft-difficult, and first-circuit-adder
      if (prices.length > 4) {
        throw new Error(
          'duplicate prices found - ids: ' + JSON.stringify(prices.map((r) => r.id)) + 'Pricing structure: ' + pricingStructure,
        );
      }
      const base = prices.find((p) => p.circuit_price_type === 'base');
      const baseCost = Number(base?.price);
      const maxCost = Number(base?.circuit_price_limit);
      if (!isValidNumber(baseCost)) {
        throw new Error(
          'no valid base price found for circuit - labor_id ' + item.labor_id + '. Price found: ' + baseCost + '. Type: ' + typeof baseCost,
        );
      }
      if (!isValidNumber(maxCost)) {
        throw new Error(
          `no valid max price found for circuit - labor_id ${item.labor_id}. Price found: ${maxCost}. Type: ${typeof maxCost}`,
        );
      }
      const difficult = item.additional_data?.electrical?.difficult;
      const perFtType = difficult ? 'per-ft-difficult' : 'per-ft-easy';
      const perFtCost = Number(prices.find((p) => p.circuit_price_type === perFtType)?.price);
      if (!isValidNumber(perFtCost)) {
        throw new Error(
          `no valid ${perFtType} cost found for circuit - labor_id ${item.labor_id}. Price found: ${perFtCost}. Type: ${typeof perFtCost}`,
        );
      }
      const length = Number(item.additional_data?.electrical?.circuit_length);
      if (!isValidNumber(length)) {
        throw new Error(
          `no valid length defined for circuit - labor_id ${item.labor_id}. Length: ${length}. Type: ${typeof length}`,
        );
      }
      let firstCircuitAdder = 0;
      if (isFirstCircuit) {
        firstCircuitAdder = Number(prices.find((p) => p.circuit_price_type === 'first-circuit-adder')?.price);
        if (!isValidNumber(firstCircuitAdder)) {
          throw new Error(
            `no valid first circuit adder found for circuit - labor_id ${item.labor_id}. Price found: ${firstCircuitAdder}. Type: ${typeof firstCircuitAdder}`,
          );
        }
        isFirstCircuit = false;
      }
      return firstCircuitAdder + Math.min(baseCost + perFtCost * length, maxCost);
    }

    function getLaborPrice(item: LineItem): number | string {
      const prices = pricesData.filter((p) => p.labor_id === item.labor_id);
      const labor: Labor | undefined = laborById[item.labor_id as number];
      if (!labor) throw new Error('labor id ' + item.labor_id + ' not found in labor data');
      if (labor.subcategory === 'circuit') return getCircuitPrice(prices, item);
      return getPrice(prices, 'labor', item);
    }
    function getEquipmentPrice(item: LineItem): number | string {
      return getPrice(pricesData.filter((p) => p.equipment_id === item.equipment_id), 'equipment', item);
    }
    function getMpPrice(item: LineItem): number | string {
      return getPrice(pricesData.filter((p) => p.maintenance_plan_id === item.maintenance_plan_id), 'equipment', item);
    }

    const result: LineItem[] = lineItems.map((it) => ({ ...it }));
    result.forEach((item, idx) => {
      try {
        let price: number | string | null | undefined;
        if (item.labor_id) price = getLaborPrice(item);
        else if (item.equipment_id) price = getEquipmentPrice(item);
        else if (item.maintenance_plan_id) price = getMpPrice(item);
        else if (item.line_item_type === 'discount') price = item.price_actual;
        else return; // deviation: leave untouched instead of NaN
        const qty = item.quantity ? item.quantity : 1;
        item.price_actual = (price as number) * qty;
      } catch (e) {
        errors.push({ ...toEngineError(e), lineItemIndex: idx, fail: false });
      }
    });

    return { ok: true, result, errors, systemType };
  } catch (e) {
    return { ok: false, errors: [toEngineError(e)] };
  }
}
