import type { Equipment, HvacSystemType, LineItem, RefData } from '../types';
import { indexById } from '../util';

export type EquipmentSource = Pick<RefData, 'equipment'> | Equipment[] | Record<number, Equipment>;

export function toEquipmentMap(src: EquipmentSource): Record<number, Equipment> {
  if (Array.isArray(src)) return indexById(src);
  if (src && Array.isArray((src as any).equipment)) return indexById((src as any).equipment as Equipment[]);
  return src as Record<number, Equipment>;
}

const DUCTED = ['AHU', 'Dual-Fuel Coil', 'Horizontal-Ducted Head'];
const DUCTLESS = ['Ceiling Cassette', 'Floor Head', 'Wall Head'];

/**
 * Port of the `getHvacSystemType` block. Folds the equipment line items into
 * 'ducted' | 'ductless' | 'mixed' | null.
 *
 * Only plain equipment rows count (equipment_id set, no labor_id / incentive_id).
 * Throws if a line item references an equipment id that is not in the catalog (the original
 * died with a TypeError there).
 */
export function getHvacSystemType(lineItems: LineItem[], equipment: EquipmentSource): HvacSystemType {
  const equipmentData = toEquipmentMap(equipment);
  const equipmentArray = lineItems.filter((item) => item.line_item_type === 'equipment');

  return equipmentArray.reduce<HvacSystemType>((type, item) => {
    if (item.equipment_id && !item.labor_id && !item.incentive_id) {
      const eq = equipmentData[item.equipment_id];
      if (!eq) throw new Error(`getHvacSystemType: no equipment row for equipment id ${item.equipment_id}`);
      if (DUCTED.includes(eq.equipment_type)) {
        if (type === 'ducted' || type === null) return 'ducted';
        if (type === 'mixed') return 'mixed';
        return 'mixed'; // ductless -> mixed
      } else if (DUCTLESS.includes(eq.equipment_type)) {
        if (type === null) return 'ductless';
        if (type === 'ductless' || type === 'mixed') return type;
        return 'mixed'; // ducted -> mixed
      }
      return type;
    }
    return type;
  }, null);
}
