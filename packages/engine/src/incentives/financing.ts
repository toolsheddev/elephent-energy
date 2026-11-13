import type { Equipment, LineItem, RefData } from '../types';

/** Line item types excluded from a system's "price" when sharing the fee (`calculateLineItemFee.js`). Note: includes 'financing fees'. */
export const FINANCING_PASSTHROUGH_TYPES: readonly string[] = ['incentive', 'change order', 'margin', 'permit', 'discount', 'financing fees'];

export const SYNCHRONY_FEE_RATE = 0.07;
export const SYNCHRONY_FEE_MARGIN_RATE = 0.007;

/** A `getLineItemsForAProposal.sql` row: a system plus its line items (`line_items` JSON aggregate). */
export interface SystemWithLineItems {
  id: number;
  system_type: string;
  line_items: LineItem[];
  [k: string]: unknown;
}

/** The parts of the `project` row the fee needs. */
export interface FinancingProject {
  /** text or list of lenders; `includes('Synchrony')` (substring for text, element for lists) enables the fee */
  lender?: string | string[] | null;
  /** `[{ lender: 'Synchrony', amount: 30000 }]` */
  financing_amounts?: Array<{ lender: string; amount: number }> | null;
}

export interface FinancingFeeUpsert {
  /** present when the system already has a 'financing fees' line (update); absent = insert */
  id?: number;
  price_actual: number;
  margin_amount: number;
  line_item_type: 'financing fees';
  description: 'Synchrony Financing Fee';
  system_id: number;
}
export interface FinancingMarginUpdate {
  id: number | undefined;
  /** new `price_actual` of the system's margin line */
  price_actual: number;
}
export interface FinancingFeesResult {
  upserts: FinancingFeeUpsert[];
  marginUpdates: FinancingMarginUpdate[];
}

/**
 * Port of `page-logic/calculateLineItemFee.js` (Synchrony financing fee).
 *
 * Only when the project's lender includes 'Synchrony' and the Synchrony financing amount is > 0. Eligible systems = HVAC
 * systems whose 'Condenser' line item points to a Mitsubishi equipment row. The fee is shared by price proportion:
 * `price_actual = round(-0.07 * amount * share, 2)`, `margin_amount = round(-0.007 * amount * share, 2)`; each system's margin
 * line becomes `(margin - oldFeeMargin) + newFeeMargin`. Returns what to write (nothing is persisted here).
 */
export function calculateFinancingFees(args: {
  systems: readonly SystemWithLineItems[];
  project: FinancingProject | null | undefined;
  equipment: readonly Equipment[] | Pick<RefData, 'equipment'>;
}): FinancingFeesResult {
  const empty: FinancingFeesResult = { upserts: [], marginUpdates: [] };
  const equipment: readonly Equipment[] = Array.isArray(args.equipment) ? args.equipment : (args.equipment as Pick<RefData, 'equipment'>).equipment;
  const project = args.project;

  const amounts: Record<string, number> = Array.isArray(project?.financing_amounts)
    ? Object.fromEntries(project!.financing_amounts!.map((i) => [i.lender, i.amount]))
    : {};
  const synchronyAmount: number | undefined = amounts.Synchrony;
  const lender = project?.lender;
  const hasSynchrony = !!lender && (lender as any).includes('Synchrony');
  if (!hasSynchrony || !synchronyAmount || synchronyAmount <= 0) return empty;

  const eligible = args.systems.filter((system) => {
    if (system.system_type !== 'hvac') return false;
    const condenser = system.line_items.find((li) => li.description === 'Condenser');
    if (!condenser) return false;
    return equipment.find((eq) => eq.id === condenser.equipment_id)?.manufacturer === 'Mitsubishi';
  });
  if (eligible.length === 0) return empty;

  const systemPrice = (s: SystemWithLineItems) =>
    s.line_items.filter((li) => !FINANCING_PASSTHROUGH_TYPES.includes(li.line_item_type as string)).reduce((sum, li) => sum + Number(li.price_actual || 0), 0);
  const totalEligibleCost = eligible.reduce((sum, s) => sum + systemPrice(s), 0);
  if (totalEligibleCost <= 0) return empty;

  const upserts: FinancingFeeUpsert[] = [];
  const marginUpdates: FinancingMarginUpdate[] = [];
  for (const system of eligible) {
    const costProportion = systemPrice(system) / totalEligibleCost;
    const price_actual = Math.round(-SYNCHRONY_FEE_RATE * synchronyAmount * costProportion * 100) / 100;
    const margin_amount = Math.round(-SYNCHRONY_FEE_MARGIN_RATE * synchronyAmount * costProportion * 100) / 100;
    const existingFee = system.line_items.find((li) => li.line_item_type === 'financing fees');
    const upsert: FinancingFeeUpsert = {
      price_actual,
      margin_amount,
      line_item_type: 'financing fees',
      description: 'Synchrony Financing Fee',
      system_id: system.id,
    };
    if (existingFee) upsert.id = existingFee.id;
    upserts.push(upsert);

    const marginLine = system.line_items.find((li) => li.line_item_type === 'margin');
    if (marginLine) {
      const oldFeeMargin = existingFee ? Number(existingFee.margin_amount) : 0;
      const updated = Math.round((Number(marginLine.price_actual) - oldFeeMargin + margin_amount) * 100) / 100;
      marginUpdates.push({ id: marginLine.id, price_actual: updated });
    }
  }
  return { upserts, marginUpdates };
}
