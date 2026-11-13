import type { IncentivesProvider } from './index';
import type { IncentiveForLimitsRow, IncentiveLimit, LineItem, RefData, System } from '../types';
import { specIncentives, type PermitCostRow } from './specIncentives';

const EXCLUDED_SYSTEM_STATUSES = ['proposed - from change order', 'deleted - from change order', 'pending deletion'];

/** Everything `specIncentives` reads from the DB that is not RefData. Every member is optional; missing = empty (no permits, no systems...). */
export interface IncentivesProviderExtra {
  /** injected clock (fallback rebate effective date); default `args.now` (given by `specAndPriceSystem`) */
  now?: string | Date;
  /** `getSystems.sql` (the house's systems). Default: `args.existing.systems` of the house minus change-order/deleted statuses. */
  houseSystems?: System[];
  /** all line items of the house's systems (to derive the limits). Default: `args.existing.lineItems`. */
  houseLineItems?: LineItem[];
  /** or give the `getIncentiveForLimits.sql` rows directly */
  incentivesForLimits?: IncentiveForLimitsRow[];
  /** `permits.sql` rows, or a function of the proposal id (new proposals have no permits yet) */
  permitLineItems?: PermitCostRow[] | ((proposalId: number | string) => PermitCostRow[]);
  /** default `input.incentivesLimitData` then `refData.incentiveLimits` */
  incentivesLimitData?: IncentiveLimit[];
  isArbitrary?: boolean;
}

/**
 * Real `IncentivesProvider` for `specAndPriceSystem(..., { incentives })`: runs the ported `specIncentives` workflow once per
 * proposal exactly as `specSystemDetails.loopProposals` called it (`initialAdd: true`, `system_margin: 'add'`,
 * system = the new system without `proposal_id`, lines = priced lines).
 * On an engine failure the lines are returned unchanged plus the error (the workflow would have ended in `catchErrors`).
 */
export function createIncentivesProvider(
  refData: Pick<RefData, 'incentives' | 'incentiveLimits'> & Partial<Pick<RefData, 'equipment' | 'labor' | 'ahri'>>,
  extra: IncentivesProviderExtra = {},
): IncentivesProvider {
  return (args) => {
    const sys = args.input.specIncentives;
    const house = sys?.house ?? args.house;
    const existing = args.existing;
    const houseSystems =
      extra.houseSystems ??
      (existing?.systems ?? []).filter(
        (s) => s.house_id === house?.id && !EXCLUDED_SYSTEM_STATUSES.includes((s.system_status ?? '') as string),
      );
    const permitLineItems = typeof extra.permitLineItems === 'function' ? extra.permitLineItems(args.proposalId) : extra.permitLineItems;

    const now = extra.now ?? args.now;
    if (now === undefined) {
      return { result: args.lineItems, errors: [{ name: 'Error', message: 'createIncentivesProvider: no clock - pass extra.now or use specAndPriceSystem (ctx.now)' }] };
    }

    const res = specIncentives(
      {
        system: args.system,
        lineItems: args.lineItems,
        house,
        customer: (sys?.customer as Record<string, unknown> | undefined) ?? args.customer ?? null,
        ahriRecord: args.ahriRecord ?? null,
        ahri_id: (sys?.ahri_id as number | null | undefined) ?? (args.system.ahri_id as number | null | undefined) ?? null,
        proposal_id: args.proposalId,
        mode: args.input.mode,
        existing_system_id: (args.input.system_id as number | undefined) ?? null,
        rebateEffectiveDate: (sys?.rebateEffectiveDate as string | undefined) ?? null,
        system_margin: 'add',
        initialAdd: true,
        incentivesLimitData: extra.incentivesLimitData ?? (args.input.incentivesLimitData as IncentiveLimit[] | undefined),
        isArbitrary: extra.isArbitrary,
      },
      { ...args.refData, ...refData },
      {
        now: now as string | Date,
        houseSystems,
        houseLineItems: extra.houseLineItems ?? existing?.lineItems,
        incentivesForLimits: extra.incentivesForLimits,
        permitLineItems,
      },
    );
    if (!res.ok) return { result: args.lineItems, errors: res.errors };
    return { result: res.result, errors: res.errors };
  };
}
