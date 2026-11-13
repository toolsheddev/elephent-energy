import type {
  EngineError,
  IncentiveForLimitsRow,
  IncentiveLimit,
  InitializedIncentiveLimit,
  LineItem,
  System,
} from '../types';

/** `normalizeIncentiveIds` of getInitializedLimits.js: array, JSON text '[1,2]' or CSV '1,2' -> number[]; anything else -> []. */
export function normalizeIncentiveIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => !isNaN(x));
    }
  }
  return [];
}

/**
 * Port of `getInitializedLimits.js`: every limit row gets `received_amount` / `received_number` = what the house already
 * received (sum of |price_actual| and count of the given incentive lines whose `incentive_id` is in the limit's ids).
 * Returns NEW objects (inputs untouched). Invalid inputs -> [] (the original logged and returned []).
 */
export function initializeLimits(
  incentivesForLimits: readonly IncentiveForLimitsRow[] | null | undefined,
  limits: readonly IncentiveLimit[] | null | undefined,
): InitializedIncentiveLimit[] {
  if (!Array.isArray(incentivesForLimits) || !Array.isArray(limits)) return [];
  const map = new Map<number, InitializedIncentiveLimit>();
  limits.forEach((limit) => {
    map.set(limit.id, { ...limit, incentive_ids: normalizeIncentiveIds(limit.incentive_ids), received_amount: 0, received_number: 0 });
  });
  incentivesForLimits.forEach((item) => {
    limits.forEach((limit) => {
      const ids = normalizeIncentiveIds(limit.incentive_ids);
      if (item.incentive_id !== null && item.incentive_id !== undefined && ids.includes(item.incentive_id)) {
        const entry = map.get(limit.id)!;
        entry.received_amount += Math.abs(Number(item.price_actual)) || 0;
        entry.received_number += 1;
      }
    });
  });
  return Array.from(map.values());
}

/**
 * The limit-application block of specIncentives (identical for rebates and tax credits except the wording of the messages).
 * `limits` are the (mutable, running) initialized limits; matching limits are applied quantity-limits-first. Returns the
 * (possibly reduced / zeroed) amount and pushes "limit reached" errors.
 */
export function applyLimits(
  actualAmount: number,
  incentive: { id: number; name: string },
  limits: InitializedIncentiveLimit[],
  errors: EngineError[],
  kind: 'incentive' | 'tax credit' = 'incentive',
): number {
  const matching = limits.filter((limit) => Array.isArray(limit.incentive_ids) && limit.incentive_ids.includes(incentive.id));
  matching.sort((a, b) => {
    const aHas = a.limit_number !== undefined && a.limit_number !== null;
    const bHas = b.limit_number !== undefined && b.limit_number !== null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return 0;
  });

  if (matching.length > 0 && actualAmount > 0) {
    for (const limit of matching) {
      // FIRST: quantity limit
      if (limit.limit_number !== undefined && limit.limit_number !== null) {
        if (limit.received_number >= limit.limit_number) {
          actualAmount = 0;
          errors.push(mkError(`Quantity limit reached for ${kind} ${incentive.name}: ${limit.description}.`));
          break;
        } else if (actualAmount > 0) {
          limit.received_number += 1;
        }
      }
      // SECOND: amount limit
      if (actualAmount > 0 && limit.limit_amount !== undefined && limit.limit_amount !== null) {
        const remaining = limit.limit_amount - limit.received_amount;
        if (actualAmount > remaining) {
          actualAmount = Math.max(0, remaining);
          errors.push(mkError(`Amount limit reached for ${kind} ${incentive.name}: ${limit.description}. Remaining amount: ${remaining}`));
        }
        limit.received_amount += actualAmount;
      }
      if (actualAmount === 0) break;
    }
  }
  return actualAmount;
}

function mkError(message: string): EngineError {
  const e = new Error(message);
  return { name: e.name, message: e.message, stack: e.stack };
}

export interface IncentivesForLimitsQuery {
  /** all systems of the house (any status; the SQL filters itself) */
  systems: readonly System[];
  /** line items of those systems */
  lineItems: readonly LineItem[];
  houseId: number;
  proposalId?: number | string | null;
  /** 'add system' | 'edit system' (| 'add_system' | 'edit_system') | null (Recalculate sends null) */
  mode?: string | null;
  /** id of the system being (re)calculated (excluded from the proposal's own lines in edit mode / recalculate) */
  existingSystemId?: number | null;
}

const EXCLUDED_LINE_STATUSES = ['proposed - from change order', 'deleted - from change order', 'pending deletion'];

/**
 * In-memory version of `getIncentiveForLimits.sql`: incentive line items (non-zero, not in a change-order/deleted status)
 * of the house's ACTIVE systems, plus - depending on `mode` - the lines of the proposal's other systems.
 * Like SQL, `s.id != existing_system_id` is false when `existingSystemId` is null.
 */
export function selectIncentivesForLimits(q: IncentivesForLimitsQuery): IncentiveForLimitsRow[] {
  const mode = q.mode ?? null;
  const proposalMatches = (s: System) =>
    q.proposalId !== null && q.proposalId !== undefined && s.proposal_id !== null && s.proposal_id !== undefined && String(s.proposal_id) === String(q.proposalId);
  const systemIds = new Set<number>();
  for (const s of q.systems) {
    if (s.id === undefined || s.house_id !== q.houseId) continue;
    const ok =
      s.system_status === 'active' ||
      (proposalMatches(s) && (mode === 'add system' || mode === 'add_system')) ||
      (proposalMatches(s) &&
        q.existingSystemId !== null &&
        q.existingSystemId !== undefined &&
        s.id !== q.existingSystemId &&
        (mode === 'edit_system' || mode === 'edit system' || !mode));
    if (ok) systemIds.add(s.id);
  }
  return q.lineItems
    .filter(
      (li) =>
        li.incentive_id !== null &&
        li.incentive_id !== undefined &&
        Number(li.price_actual) !== 0 &&
        !!li.system_id &&
        systemIds.has(li.system_id) &&
        (li.status === null || li.status === undefined || !EXCLUDED_LINE_STATUSES.includes(li.status)),
    )
    .map((li) => ({ price_actual: li.price_actual as number | string | null, incentive_id: li.incentive_id as number }));
}
