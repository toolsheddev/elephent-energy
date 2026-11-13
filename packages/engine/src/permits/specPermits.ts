import type {
  House,
  LineItem,
  Permit,
  PermitRow,
  PermitWrites,
  RefData,
  SpecPermitsInput,
  SpecPermitsResult,
  System,
} from '../types';
import { toEngineError } from '../util';

const EXCLUDED_SYSTEM_STATUSES = ['proposed - from change order', 'deleted - from change order', 'pending deletion'];

/**
 * `permits` SQL: for the house pick ONE permit per permit_type with precedence
 * state > city > county > 'other' (jurisdiction_type), lowest id wins inside a level.
 * Equality is case-sensitive and a NULL house value matches nothing (SQL semantics).
 * Result order = state rows, then city, county, other (UNION ALL order).
 */
export function selectPermitsForHouse(permits: PermitRow[], house: Pick<House, 'state' | 'city' | 'county'>): PermitRow[] {
  const firstPerType = (rows: PermitRow[]): Map<string, PermitRow> => {
    const m = new Map<string, PermitRow>();
    [...rows].sort((a, b) => a.id - b.id).forEach((r) => {
      if (!m.has(r.permit_type)) m.set(r.permit_type, r);
    });
    return m;
  };
  const level = (type: PermitRow['jurisdiction_type'], value: string | null | undefined) =>
    firstPerType(
      permits.filter((p) => p.jurisdiction_type === type && (type === 'other' || (value != null && p.jurisdiction === value))),
    );
  const state = level('state', house.state);
  const city = level('city', house.city);
  const county = level('county', house.county);
  const other = level('other', null);

  const out: PermitRow[] = [...state.values()];
  city.forEach((p, t) => {
    if (!state.has(t)) out.push(p);
  });
  county.forEach((p, t) => {
    if (!state.has(t) && !city.has(t)) out.push(p);
  });
  other.forEach((p, t) => {
    if (!state.has(t) && !city.has(t) && !county.has(t)) out.push(p);
  });
  return out;
}

/**
 * Port of the `specPermits` block.
 *
 * Creates/refreshes the permit line items (type 'permit') on the proposal's catch-all ('other') system:
 * one each for the hvac / electrical / plumbing permit that applies to the house's jurisdiction, provided
 * the proposal contains labor of the matching category. HVAC permits may be priced as
 * `round(sum(price_actual of the proposal's hvac-system line items) * multiplier_value)`. +$100 per permit in MA.
 *
 * The Retool block upserted the result into line_items_new (by id) and deleted stale permit rows;
 * here both are returned as `writes` for the caller to persist. As in the original, stale permits are only
 * deleted when at least one permit line item is produced.
 *
 * Differences: `price_actual` values are coerced with Number() (pg returns numerics as strings, which would
 * concatenate in the original reduce).
 */
export function specPermits(
  input: SpecPermitsInput,
  refData: Pick<RefData, 'permits' | 'labor'>,
): SpecPermitsResult {
  try {
    const { house, proposalId } = input;
    const notes: string[] = [];
    const empty = (note?: string): SpecPermitsResult => {
      if (note) notes.push(note);
      return { ok: true, lineItems: [], writes: { inserts: [], updates: [], deletes: [] }, notes };
    };
    if (!proposalId) return empty('No proposalId provided; nothing to do.');

    const permitRecords = selectPermitsForHouse(refData.permits, house);
    const permitsObj: Record<'hvac' | 'electrical' | 'plumbing', PermitRow | undefined> = {
      hvac: permitRecords.find((p) => p.permit_type === 'hvac'),
      electrical: permitRecords.find((p) => p.permit_type === 'electrical'),
      plumbing: permitRecords.find((p) => p.permit_type === 'plumbing'),
    };

    // systems.sql
    const systemsThisHouse: System[] = input.systems.filter(
      (s) => s.house_id === house.id && s.system_status != null && !EXCLUDED_SYSTEM_STATUSES.includes(s.system_status),
    );
    if (!systemsThisHouse.length) return empty('No systems found for house: ' + house.id);

    const systemsThisProposal = systemsThisHouse.filter((s) => s.proposal_id === proposalId);
    if (!systemsThisProposal.length) return empty('No systems found for proposal: ' + proposalId);
    const systemIds = systemsThisProposal.map((s) => s.id as number);

    // line_items.sql + in-code filters
    const lineItemsAll = input.lineItems.filter(
      (li) => systemIds.includes(li.system_id as number) && (li.status == null || !EXCLUDED_SYSTEM_STATUSES.includes(li.status)),
    );
    const lineItems = lineItemsAll.filter((li) => systemIds.includes(li.system_id as number) && li.line_item_type !== 'incentive');

    // labor_filtered.sql
    const laborIds = lineItems.reduce<number[]>((acc, li) => (li.labor_id ? [...acc, li.labor_id] : acc), []);
    const laborRecords = refData.labor.filter((l) => laborIds.includes(l.id));
    if (!laborRecords.length) return empty('No labor records found for ids: ' + JSON.stringify(laborIds));

    const catchallSystem = systemsThisProposal.find((s) => s.system_type === 'other');
    if (!catchallSystem) return empty('Could not find catchall system for proposal ID: ' + proposalId);

    const oldPermitLineItems = lineItems.filter((li) => li.system_id === catchallSystem.id && li.line_item_type === 'permit');

    const getPermitLineItem = (permit: PermitRow | undefined): Permit | null => {
      if (!permit) return null;
      const validLabor = laborRecords.some((r) => r.category === permit.permit_type);
      if (!validLabor) return null;

      let permitCost: number;
      const cost = permit?.price?.cost;
      if (cost instanceof Object) {
        if (cost.multiplier_type === 'hvac' && cost.multiplier_value) {
          const hvacSystemIds = systemsThisProposal.filter((s) => s.system_type === 'hvac').map((s) => s.id);
          const hvacCost = lineItems.reduce(
            (acc, item) => (hvacSystemIds.includes(item.system_id) ? acc + Number(item.price_actual ?? 0) : acc),
            0,
          );
          permitCost = Math.round(hvacCost * cost.multiplier_value);
        } else {
          notes.push('Invalid multiplier type for permit ' + permit.name);
          return null;
        }
      } else if (typeof cost === 'number') {
        permitCost = cost;
      } else {
        notes.push(`Invalid permit price JSON structure for ${permit.name}`);
        return null;
      }

      // If house is in MA, add $100 per permit
      if (house.state === 'MA') permitCost += 100;

      const newPermit: Permit = {
        system_id: catchallSystem.id as number,
        permit_id: permit.id,
        price_actual: permitCost,
        line_item_type: 'permit',
        description: permit.name,
      };
      const oldPermit = oldPermitLineItems.find((li) => li.permit_id === permit.id);
      if (oldPermit) newPermit.id = oldPermit.id;
      return newPermit;
    };

    const permitLineItems = (['hvac', 'electrical', 'plumbing'] as const).reduce<Permit[]>((acc, type) => {
      const item = getPermitLineItem(permitsObj[type]);
      if (item) acc.push(item);
      return acc;
    }, []);

    if (!permitLineItems.length) return empty('No new permit line items were created.');

    const permitsToDelete: LineItem[] = oldPermitLineItems.filter(
      (old) => !permitLineItems.find((n) => n.id === old.id),
    );

    const writes: PermitWrites = {
      inserts: permitLineItems.filter((p) => p.id === undefined),
      updates: permitLineItems.filter((p) => p.id !== undefined),
      deletes: permitsToDelete.map((p) => p.id as number),
    };
    return { ok: true, lineItems: permitLineItems, writes, notes };
  } catch (e) {
    return { ok: false, errors: [toEngineError(e)] };
  }
}
