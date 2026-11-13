import type {
  EngineError,
  Equipment,
  ElectricalCondition,
  Failure,
  Labor,
  LineItem,
  RefData,
  SpecEquipmentOptions,
} from '../types';
import { buildLookups, clone, getLookups, toEngineError } from '../util';

export type SpecEquipmentResult = { ok: true; lineItems: LineItem[] } | Failure;

const INDOOR_TYPES = ['AHU', 'Dual-Fuel Coil', 'Wall Head', 'Ceiling Cassette', 'Floor Head', 'Horizontal-Ducted Head', 'furnace'];

export function getIndoorUnits(lineItems: LineItem[], equipmentData: Record<number, Equipment>): Equipment[] {
  return lineItems
    .filter((item) => {
      const equipment = equipmentData[item.equipment_id as number];
      return item.equipment_id && !item.labor_id && equipment && INDOOR_TYPES.includes(equipment.equipment_type);
    })
    .map((item) => equipmentData[item.equipment_id as number]);
}

/** First Condenser line item's equipment row (or undefined). */
export function getOutdoorUnit(lineItems: LineItem[], equipmentData: Record<number, Equipment>): Equipment | undefined {
  const r = lineItems.find((u) => u.equipment_id && equipmentData[u.equipment_id]?.equipment_type === 'Condenser');
  return r ? equipmentData[r.equipment_id as number] : undefined;
}

/** Indoor series of the first indoor unit (the original never threw on mixed series). */
function indoorUnitSeries(indoorUnits: Equipment[]): string | null | undefined {
  let indoorSeries: string | null | undefined = null;
  indoorUnits.forEach((unit) => {
    if (indoorSeries == null) indoorSeries = unit.model_series;
  });
  return indoorSeries;
}

/** Recursively add additional equipment (stand/pad, PAC-445, 24VAC transformer, ...). */
export function getAdditionalEquipment(ids: number[] | null | undefined, equipmentData: Record<number, Equipment>): LineItem[] {
  let additional: LineItem[] = [];
  if (!ids || ids.length === 0) return additional;
  ids.forEach((id) => {
    const equipment = equipmentData[id];
    additional.push({ equipment_id: id });
    if ((equipment?.additional_equipment_ids?.length ?? 0) > 0) {
      additional = additional.concat(getAdditionalEquipment(equipment?.additional_equipment_ids, equipmentData));
    }
  });
  return [...additional];
}

/**
 * Core of the `specEquipment` block; THROWS on any rule violation (the Retool workflow let these bubble to
 * its error handler). Use {@link specEquipment} for the Result-returning variant.
 *
 * Given the "primary" line items chosen in the UI (condenser, AHUs, heads, ...), returns the full list:
 *  1. each item + its install labor (equipment.labor_id) + recursive `additional_equipment_ids`;
 *  2. for Mitsubishi systems with >1 indoor unit (unless manual branch-box override): branch boxes (M indoor on
 *     SM outdoor; chosen by refrigerant R-410A/R-454B and indoor count: <=3 3-port, <=5 5-port, 6 = 2x3-port +
 *     tee, 7-8 = 5+3 port + tee, 9-10 = 2x5 port + tee, >10 error) or branch joints (S indoor on SM outdoor:
 *     2 -> CMY-Y62, <=4 -> CMY-Y64, <=8 -> CMY-Y68, >8 error);
 *  3. a "Refrigerant Adder" (or ">3 IDU" variant) matching the outdoor refrigerant when any branch box exists;
 *  4. electrical circuits per `equipment.electrical_requirements` (first condition that matches wins);
 *  5. descriptions / line_item_type / equipment_provider.
 *
 * Deviations: catalog ids for branch boxes/joints are resolved lazily (the original threw a TypeError for
 * EVERY call if any of the nine model numbers was missing from the catalog); inputs are cloned, not mutated.
 */
export function specEquipmentUnsafe(
  lineItemArray: LineItem[],
  equipmentData: Record<number, Equipment>,
  laborData: Record<number, Labor>,
  opts: SpecEquipmentOptions = {},
): LineItem[] {
  if (!lineItemArray || lineItemArray.length === 0) throw new Error('Some line items must be provided to specEquipment');
  const { CircuitDifficultBB1, CircuitDifficultBB2, CircuitLengthBB1, CircuitLengthBB2 } = opts;
  const isManualBBOverride = opts.isManualBBOverride ?? false;
  const equipmentArray = Object.values(equipmentData);

  const modelId = (model: string): number => {
    const row = equipmentArray.find((r) => r.model_number === model);
    if (!row) throw new Error(`specEquipment: equipment with model_number ${model} not found in catalog`);
    return row.id;
  };

  let result: LineItem[] = [];
  clone(lineItemArray).forEach((li) => {
    const equipment = equipmentData[li.equipment_id as number];
    result.push(li);
    // add install labor
    if (equipment && equipment.labor_id) result.push({ labor_id: equipment.labor_id, equipment_id: equipment.id });
    // recursively add additional equipment
    result = result.concat(getAdditionalEquipment(equipment?.additional_equipment_ids, equipmentData));
  });

  // Spec branch boxes & joint pipes for multi-unit systems
  const indoorUnits = getIndoorUnits(result, equipmentData);
  const indoorSeries = indoorUnitSeries(indoorUnits);
  const outdoorUnit = getOutdoorUnit(lineItemArray, equipmentData);

  if (indoorUnits.length > 1) {
    // 1. Branch boxes first
    if (!isManualBBOverride) {
      if (outdoorUnit?.manufacturer === 'Mitsubishi') {
        if (indoorSeries === 'M' && outdoorUnit.model_series === 'M') {
          // no joints needed for matching M series units
        } else if (indoorSeries === 'M' && outdoorUnit.model_series === 'SM') {
          // branch boxes needed for M indoor with SM outdoor units
          const bb1Data: LineItem['additional_data'] = { electrical: {} };
          const bb2Data: LineItem['additional_data'] = { electrical: {} };
          if (indoorUnits.length > 5) {
            bb1Data!.electrical!.circuit_length = CircuitLengthBB1 || 0;
            bb2Data!.electrical!.circuit_length = CircuitLengthBB2 || 0;
            bb1Data!.electrical!.difficult = CircuitDifficultBB1 || false;
            bb2Data!.electrical!.difficult = CircuitDifficultBB2 || false;
          }
          let bb3_id: number;
          let bb5_id: number;
          if (outdoorUnit.refrigerant === 'R-410A') {
            bb3_id = modelId('PAC-MKA32BC');
            bb5_id = modelId('PAC-MKA52BC');
          } else if (outdoorUnit.refrigerant === 'R-454B') {
            bb3_id = modelId('PAC-LMA30BC');
            bb5_id = modelId('PAC-LMA50BC');
          } else {
            throw new Error('Outdoor Unit does not have a valid refrigerant specified');
          }
          const joint = () => modelId(outdoorUnit.refrigerant === 'R-454B' ? 'MSDD-50AR2-E' : 'MSDD-50AR-E');
          const n = indoorUnits.length;
          if (n <= 3) result.push({ equipment_id: bb3_id });
          else if (n <= 5) result.push({ equipment_id: bb5_id });
          else if (n === 6)
            result.push({ equipment_id: bb3_id, additional_data: bb1Data }, { equipment_id: bb3_id, additional_data: bb2Data }, { equipment_id: joint() });
          else if (n <= 8)
            result.push({ equipment_id: bb5_id, additional_data: bb1Data }, { equipment_id: bb3_id, additional_data: bb2Data }, { equipment_id: joint() });
          else if (n <= 10)
            result.push({ equipment_id: bb5_id, additional_data: bb1Data }, { equipment_id: bb5_id, additional_data: bb2Data }, { equipment_id: joint() });
          else throw new Error('too many M series indoor units. Count: ' + n);
        } else if (indoorSeries === 'S' && outdoorUnit?.model_series === 'SM') {
          // branch joints/headers needed for S indoor with SM outdoor units
          const n = indoorUnits.length;
          if (n === 2) result.push({ equipment_id: modelId('CMY-Y62-G-E') });
          else if (n <= 4) result.push({ equipment_id: modelId('CMY-Y64-G-E') });
          else if (n <= 8) result.push({ equipment_id: modelId('CMY-Y68-G-E') });
          else throw new Error('too many S series indoor units. Count: ' + n);
        }
        // all other multi-indoor combos: nothing to add
      }
    }

    // 2. Refrigerant adder (evaluated after branch boxes are in result)
    const branchBoxIds = ['PAC-MKA32BC', 'PAC-MKA52BC', 'PAC-LMA30BC', 'PAC-LMA50BC']
      .map((m) => equipmentArray.find((r) => r.model_number === m)?.id)
      .filter((v): v is number => v !== undefined);
    const hasBranchBox = result.some((li) => {
      const eq = equipmentData[li.equipment_id as number];
      return (
        eq &&
        (branchBoxIds.includes(li.equipment_id as number) ||
          (eq.equipment_type && eq.equipment_type.toLowerCase().includes('branch box')) ||
          (eq.equipment_name && eq.equipment_name.toLowerCase().includes('branch box')) ||
          (li.additional_data && li.additional_data.branchBoxId))
      );
    });

    if (hasBranchBox) {
      const targetAdderName = indoorUnits.length > 3 ? 'Refrigerant Adder >3 IDU' : 'Refrigerant Adder';
      const refrigerantAdder = equipmentArray.find(
        (eq) => eq.equipment_name === targetAdderName && eq.refrigerant === outdoorUnit?.refrigerant,
      );
      if (refrigerantAdder) result.push({ equipment_id: refrigerantAdder.id });
    }
  }

  // add circuits
  const circuitLaborArray = Object.values(laborData).filter((row) => row.subcategory === 'circuit');
  result.forEach((item) => {
    if (!item.equipment_id || item.labor_id) return;
    const equipment = equipmentData[item.equipment_id];
    const reqs = equipment?.electrical_requirements;
    if (equipment && reqs && Object.keys(reqs).length > 0) {
      const circuitReq = reqs as ElectricalCondition[];
      const matched = circuitReq.find((condition) => {
        let conditionMet = false;
        if (condition.condition_type === 'item_count') {
          const matchCount = result.filter((row) => {
            if (row.labor_id || row.incentive_id) return false;
            // check all conditions in condition.filter against the equipment record
            return Object.keys(condition.filter ?? {}).every((key) =>
              (condition.filter as Record<string, unknown[]>)[key].every((innerKey) => {
                const rowEq = equipmentData[row.equipment_id as number];
                return !!rowEq && (rowEq as any)[key] === innerKey;
              }),
            );
          }).length;
          switch (condition.operand) {
            case '=':
              conditionMet = matchCount === condition.value;
              break;
            case '>=':
              conditionMet = matchCount >= (condition.value as number);
              break;
            case '<=':
              conditionMet = matchCount <= (condition.value as number);
              break;
          }
        } else if (condition.condition_type === 'none') {
          conditionMet = true;
        } else if (condition.condition_type) {
          throw new Error(
            'invalid electrical condition for ' + equipment?.model_number + ': condition type ' + condition.condition_type + ' is not valid',
          );
        }
        return conditionMet;
      });
      const circuits = matched?.circuits;
      if (circuits && Array.isArray(circuits)) {
        circuits.forEach((circuitData) => {
          const labor = circuitLaborArray.find((row) => row.circuit_amps === circuitData.amperage && row.circuit_voltage === circuitData.voltage);
          const circuit: LineItem = { labor_id: labor?.id, equipment_id: equipment?.id };
          if (circuit.labor_id) {
            // circuit data passed from the UI through the equipment line item
            circuit.additional_data = item.additional_data;
            result.push(circuit);
          } else {
            throw new Error('Labor record not found for requested ' + circuitData.amperage + 'A ' + circuitData.voltage + 'V circuit');
          }
        });
      }
    }
  });

  // Add item descriptions
  result.forEach((item) => {
    if (item.labor_id) {
      const labor = laborData[item.labor_id];
      if (labor) {
        item.line_item_type = 'labor';
        item.description = labor.name;
      }
    } else if (item.equipment_id) {
      item.line_item_type = 'equipment';
      const equipment = equipmentData[item.equipment_id];
      if (equipment) {
        item.description = (equipment.model_number ? equipment.model_number + ' | ' : '') + equipment.equipment_name;
        item.equipment_provider = equipment.provider;
      }
    }
  });

  return result;
}

/**
 * Result-returning wrapper: see {@link specEquipmentUnsafe} for the rules.
 * `refData` needs equipment + labor; pass `laborOverride` to use the labor list the UI sent instead.
 */
export function specEquipment(
  lineItems: LineItem[],
  refData: Pick<RefData, 'equipment' | 'labor'>,
  opts: SpecEquipmentOptions = {},
  laborOverride?: Labor[],
): SpecEquipmentResult {
  try {
    const { equipmentById, laborById } = laborOverride ? buildLookups(refData.equipment, laborOverride) : getLookups(refData);
    return { ok: true, lineItems: specEquipmentUnsafe(lineItems, equipmentById, laborById, opts) };
  } catch (e) {
    return { ok: false, errors: [toEngineError(e) as EngineError] };
  }
}
