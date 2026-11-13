import type { AhriCertification, EngineError, Failure, House, IncentiveLimit, LineItem, RefData, System } from '../types';
import { toEngineError } from '../util';
import { specIncentives, type SpecIncentivesContext, type SpecIncentivesOk } from './specIncentives';

export interface RecalculateSystemArgs {
  /** the persisted system row (needs `id`, `system_type`, `target_margin`, `proposal_id`; `ahri_id`, `rebate_effective_date` when set) */
  system: System;
  /** the system's CURRENT persisted lines from the DB (incentive + margin lines included; the page re-reads them first) */
  lineItems: LineItem[];
  house: House;
  customer?: Record<string, unknown> | null;
  ahriRecord?: AhriCertification | null;
  rebateEffectiveDate?: string | Date | null;
  incentivesLimitData?: IncentiveLimit[];
  refData: Pick<RefData, 'incentives' | 'incentiveLimits'> & Partial<Pick<RefData, 'equipment' | 'labor' | 'ahri'>>;
  /**
   * DB state: `houseSystems`, `permitLineItems`, and `incentivesForLimits` (or `houseLineItems`). For Retool's Recalculate the
   * limits query runs with `mode = null` and `existing_system_id = system.id` (so this system's own lines are not counted).
   */
  ctx: SpecIncentivesContext;
  /**
   * Lines without a `state` get `state: 'persisted'` before the margin step (the margin step silently keeps `margin_amount`
   * of lines with an unknown state). Default true; DB rows normally carry the column.
   */
  assumePersisted?: boolean;
}

export interface RecalculateSystemOk {
  ok: true;
  /** the full new line set for the system (margin line, then incentive lines), without permit lines; `temp_id` stripped */
  lineItems: LineItem[];
  /** rows to upsert by `id` (no id = insert), `system_id` set, permit lines excluded (they are owned by specPermits) */
  upserts: LineItem[];
  /** ids of persisted incentive lines that are no longer produced (ineligible / limit). NB: the Retool page did NOT delete these. */
  deletes: number[];
  /** the margin line (Elephant Margin) of the new set */
  margin: LineItem;
  errors: EngineError[];
  warnings: EngineError[];
  existingSystem: SpecIncentivesOk['existingSystem'];
}

/**
 * The Recalculate button: re-run margin + incentives (+ finance charges, caps) on the system's CURRENT persisted lines
 * (`specIncentives` with `initialAdd:false`, `mode:null`, `system_margin:'add'`) and describe the writes. Nothing is persisted.
 * Idempotent: feeding `result.lineItems` back in (with the same ctx) yields identical lines.
 * The financing-fee step (`calculateFinancingFees`) is separate, as on the page.
 */
export function recalculateSystem(args: RecalculateSystemArgs): RecalculateSystemOk | Failure {
  try {
    return runRecalculate(args);
  } catch (e) {
    return { ok: false, errors: [toEngineError(e)] };
  }
}

function runRecalculate(args: RecalculateSystemArgs): RecalculateSystemOk | Failure {
  const assume = args.assumePersisted !== false;
  const lines = args.lineItems.map((li) => (assume && !li.state ? { ...li, state: 'persisted' as const } : li));
  const res = specIncentives(
    {
      system: args.system,
      lineItems: lines,
      house: args.house,
      customer: args.customer ?? null,
      ahriRecord: args.ahriRecord ?? null,
      ahri_id: (args.system.ahri_id as number | null | undefined) ?? null,
      proposal_id: (args.system.proposal_id as number | string | null | undefined) ?? null,
      mode: null,
      existing_system_id: args.system.id ?? null,
      rebateEffectiveDate: args.rebateEffectiveDate ?? null,
      system_margin: 'add',
      initialAdd: false,
      incentivesLimitData: args.incentivesLimitData,
    },
    args.refData,
    args.ctx,
  );
  if (!res.ok) return res;

  const withoutPermits = res.result
    .filter((li) => li.line_item_type !== 'permit')
    .map((li) => {
      const { temp_id: _t, ...rest } = li;
      return rest as LineItem;
    });
  const upserts = withoutPermits.map((li) => (args.system.id !== undefined ? { ...li, system_id: args.system.id } : li));
  const keptIds = new Set(withoutPermits.map((li) => li.id).filter((id): id is number => id !== undefined));
  const deletes = res.deletedIncentives.map((li) => li.id).filter((id): id is number => id !== undefined && !keptIds.has(id));
  const margin = withoutPermits.find((li) => li.line_item_type === 'margin') as LineItem;

  return { ok: true, lineItems: withoutPermits, upserts, deletes, margin, errors: res.errors, warnings: res.warnings, existingSystem: res.existingSystem };
}
