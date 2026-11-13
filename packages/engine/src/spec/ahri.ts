import type {
  AhriCertification,
  Equipment,
  ExistingProposalData,
  HvacSystemType,
  RefData,
  SurgeCountRow,
  WarrantyCountsRow,
} from '../types';
import { indexById, sqlLike } from '../util';

export interface AhriQuery {
  condenserModel: string | null;
  indoorModel: string | null;
  systemDuctingType: HvacSystemType;
  furnaceModel: string | null;
  coilModel: string | null;
  waterHeaterModel: string | null;
}

/**
 * In-memory version of the `ahri` SQL (ahri_certifications_new):
 *
 *   (REPLACE(COALESCE(condenser,''),'.TH','') LIKE fuzzy_parent_id_opt
 *     AND ( (furnace IS NOT NULL AND coil LIKE fuzzy_child_id_opt AND furnace LIKE fuzzy_furnace_id_opt)
 *        OR (furnace IS NULL AND (indoor LIKE fuzzy_child_id_opt OR child_equipment_id = '' OR child_equipment_id IS NULL)
 *            AND (furnace_id IS NULL OR furnace_id = '' OR furnace_id = '%')) )
 *     AND ductingType = certification_type_detail)
 *   OR (certification_type = 'water heater' AND parent_equipment_id LIKE '%' || waterHeaterModel || '%')
 *   ORDER BY specificity_rank_opt DESC LIMIT 1
 *
 * Note the unparenthesised OR: a water-heater certification row matches independent of the HVAC clauses
 * (with waterHeaterModel = null the original builds the pattern '%null%').
 */
export function findAhriRecord(ahri: AhriCertification[], q: AhriQuery): AhriCertification | null {
  const condenser = (q.condenserModel ?? '').split('.TH').join(''); // SQL REPLACE replaces every occurrence
  const matches = ahri.filter((row) => {
    const hvac =
      sqlLike(condenser, row.fuzzy_parent_id_opt) &&
      ((q.furnaceModel !== null &&
        sqlLike(q.coilModel, row.fuzzy_child_id_opt) &&
        sqlLike(q.furnaceModel, row.fuzzy_furnace_id_opt)) ||
        (q.furnaceModel === null &&
          (sqlLike(q.indoorModel, row.fuzzy_child_id_opt) || row.child_equipment_id === '' || row.child_equipment_id == null) &&
          (row.furnace_id == null || row.furnace_id === '' || row.furnace_id === '%'))) &&
      q.systemDuctingType !== null &&
      q.systemDuctingType === row.certification_type_detail;
    const wh =
      row.certification_type === 'water heater' && sqlLike(row.parent_equipment_id, '%' + q.waterHeaterModel + '%');
    return hvac || wh;
  });
  matches.sort((a, b) => (b.specificity_rank_opt ?? -Infinity) - (a.specificity_rank_opt ?? -Infinity));
  return matches[0] ?? null;
}

const MINISPLIT_TYPES = ['Wall Head', 'Floor Head', 'Ceiling Cassette'];

/**
 * In-memory version of the `warrantyCounts` SQL: per proposal, counts of condensers / AHUs+furnaces / mini-split
 * heads among its equipment line items (labor_id IS NULL) on proposed/active systems, only proposals that
 * have at least one condenser.
 */
export function computeWarrantyCounts(
  proposalIds: Array<number | string>,
  existing: ExistingProposalData,
  equipment: RefData['equipment'] | Record<number, Equipment>,
): WarrantyCountsRow[] {
  const eq = Array.isArray(equipment) ? indexById(equipment) : equipment;
  const ids = proposalIds.map(Number);
  const rows: WarrantyCountsRow[] = [];
  const groups = new Map<string, WarrantyCountsRow>();
  for (const sys of existing.systems) {
    if (!ids.includes(Number(sys.proposal_id))) continue;
    if (!(sys.system_status == null || ['proposed', 'active - from change order'].includes(sys.system_status))) continue;
    const fuel = (sys.system_type_detail?.fuel as string | undefined) ?? null;
    for (const li of existing.lineItems) {
      if (li.system_id !== sys.id || li.labor_id || !li.equipment_id) continue;
      if (!(li.status == null || ['active - from finalized proposal', 'active - from change order'].includes(li.status))) continue;
      const e = eq[li.equipment_id];
      if (!e) continue; // INNER JOIN equipment
      const key = sys.proposal_id + '|' + fuel;
      let row = groups.get(key);
      if (!row) {
        row = { proposal_id: Number(sys.proposal_id), fuel_type: fuel, condenser_manufacturer: null, condenser_count: 0, ahu_count: 0, minisplit_count: 0 };
        groups.set(key, row);
        rows.push(row);
      }
      if (e.equipment_type === 'Condenser') {
        row.condenser_count = Number(row.condenser_count) + 1;
        if (e.manufacturer != null && (row.condenser_manufacturer == null || e.manufacturer > row.condenser_manufacturer)) {
          row.condenser_manufacturer = e.manufacturer; // MAX()
        }
      }
      if (e.equipment_type === 'AHU' || e.equipment_type === 'furnace') row.ahu_count = Number(row.ahu_count) + 1;
      if (MINISPLIT_TYPES.includes(e.equipment_type)) row.minisplit_count = Number(row.minisplit_count) + 1;
    }
  }
  return rows.filter((r) => Number(r.condenser_count) > 0);
}

/**
 * In-memory version of `checkExistingSurge`: number of whole-home surge protectors (labor_id 122) already on each
 * proposal's systems, excluding the edited system when mode is not 'add system'.
 */
export function computeSurgeCounts(
  proposalIds: Array<number | string>,
  existing: ExistingProposalData,
  mode: string,
  editedSystemId?: number | null,
): SurgeCountRow[] {
  const ids = proposalIds.map(Number);
  const counts = new Map<number, number>();
  for (const sys of existing.systems) {
    if (!ids.includes(Number(sys.proposal_id))) continue;
    if (!(mode === 'add system' || mode === 'add_system' || sys.id !== editedSystemId)) continue;
    for (const li of existing.lineItems) {
      if (li.system_id === sys.id && li.labor_id === 122) {
        counts.set(Number(sys.proposal_id), (counts.get(Number(sys.proposal_id)) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].map(([proposal_id, count]) => ({ proposal_id, count }));
}
