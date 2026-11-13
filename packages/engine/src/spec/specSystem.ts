import type {
  EngineError,
  ExistingProposalData,
  Failure,
  LineItem,
  NewSystem,
  PricedLineItem,
  RefData,
  SpecContext,
  SurgeCountRow,
  SystemInput,
} from '../types';
import { noIncentives, type IncentivesProvider } from '../incentives';
import { priceLineItems } from '../pricing/priceLineItems';
import { clone } from '../util';
import { computeSurgeCounts, computeWarrantyCounts } from './ahri';
import { specSystemDetails } from './specSystemDetails';

/** `parse_proposals` block: numeric ids are existing proposals, non-numeric strings are NEW proposal nicknames. */
export function parseProposals(proposalIds: Array<number | string> | null | undefined): {
  existingIds: number[];
  newProposalNames: string[];
} {
  const existingIds: number[] = [];
  const newProposalNames: string[] = [];
  (proposalIds || []).forEach((item) => {
    if (typeof item === 'string' && isNaN(Number(item))) newProposalNames.push(item);
    else existingIds.push(Number(item));
  });
  return { existingIds, newProposalNames };
}

/** Writes the `create_new_proposals_loop` SQL performed for each new proposal name. */
export interface NewProposalWrite {
  proposal: {
    project_id: number | null;
    house_id: number;
    proposal_status: 'pending';
    nickname: string;
    proposal_created_at: string;
  };
  /** Placeholder 'other' (catch-all) system created together with the proposal. */
  catchAllSystem: { system_type: 'other'; house_id: number; system_status: 'proposed'; system_created_at: string };
}

export interface SpecAndPriceContext extends SpecContext {
  /** Injected clock (ISO string / Date) - used for created_at stamps and as pricing date fallback. */
  now: string | Date;
  /** Ids the caller got back after inserting `newProposals` (by nickname). Missing -> the nickname is used as placeholder id. */
  newProposalIds?: Record<string, number>;
  /** Existing DB rows for the target proposals; used to derive warranty counts & surge counts when not given explicitly. */
  existing?: ExistingProposalData;
  surgeCounts?: SurgeCountRow[];
  incentives?: IncentivesProvider;
}

export interface ProposalSpecResult {
  proposal_id: number | string;
  system: NewSystem;
  lineItems: LineItem[];
  errors: EngineError[];
  status: 'success' | 'error';
}

export interface SpecAndPriceOk {
  ok: true;
  proposals: ProposalSpecResult[];
  /** Proposals the caller must INSERT (with their catch-all system) before persisting `proposals`. */
  newProposals: NewProposalWrite[];
}

/**
 * Whole `specSystemDetails` workflow as one pure function:
 * parse proposals -> specSystemDetails -> priceLineItems -> (incentives provider) -> per-proposal assembly
 * (`transformResult`): whole-home surge de-duplication and, in edit mode, re-attaching manually added line items.
 *
 * Returns the per-proposal `{system, lineItems}` to persist; nothing is written.
 */
export function specAndPriceSystem(
  input: SystemInput,
  refData: RefData,
  ctx: SpecAndPriceContext,
): SpecAndPriceOk | Failure {
  const plan = parseProposals(input.specIncentives?.proposal_id);
  const nowIso = new Date(ctx.now).toISOString();
  const house = input.specIncentives?.house;

  const newProposals: NewProposalWrite[] = plan.newProposalNames.map((name) => ({
    proposal: {
      project_id: ((input.specIncentives?.project as any)?.id ?? null) as number | null,
      house_id: house?.id as number,
      proposal_status: 'pending',
      nickname: name,
      proposal_created_at: nowIso,
    },
    catchAllSystem: { system_type: 'other', house_id: house?.id as number, system_status: 'proposed', system_created_at: nowIso },
  }));
  const newIds = plan.newProposalNames.map((n) => ctx.newProposalIds?.[n] ?? n);
  const proposalIds: Array<number | string> = [...plan.existingIds, ...newIds];

  const warrantyCounts =
    ctx.warrantyCounts ?? (ctx.existing ? computeWarrantyCounts(proposalIds, ctx.existing, refData.equipment) : []);

  const spec = specSystemDetails(input, refData, { ...ctx, warrantyCounts });
  if (!spec.ok) return spec;

  const priced = priceLineItems(spec.lineItems, refData, {
    pricingStructure: input.PricingStructure,
    pricingEffectiveDate: input.PricingEffectiveDate,
    now: ctx.now,
  });
  if (!priced.ok) return priced;

  const surgeData: SurgeCountRow[] =
    ctx.surgeCounts ??
    (ctx.existing ? computeSurgeCounts(proposalIds, ctx.existing, input.mode, input.system_id ?? null) : []);
  const provider = ctx.incentives ?? noIncentives;

  const proposals: ProposalSpecResult[] = proposalIds.map((proposalId) => {
    const errors: EngineError[] = [...spec.errors];
    const incentiveRes = provider({
      input,
      system: spec.newSystem,
      proposalId,
      lineItems: clone(priced.result) as PricedLineItem[],
      refData,
      ahriRecord: spec.ahriRecord,
      house,
      customer: (input.specIncentives?.customer as Record<string, unknown> | undefined) ?? null,
      now: ctx.now,
      existing: ctx.existing,
    });
    errors.push(...priced.errors);
    if (incentiveRes.errors) errors.push(...incentiveRes.errors);

    const system: NewSystem = { ...spec.newSystem, proposal_id: proposalId };
    let currentLineItems: LineItem[] = [...incentiveRes.result];

    // --- surge protector clean-up: whole-home surge may exist only once per proposal
    if (input.surgeProtection === 'Whole Home') {
      const match = surgeData.find((r) => String(r.proposal_id) === String(proposalId));
      const existingCount = match ? parseInt(String(match.count)) : 0;
      if (existingCount > 0) currentLineItems = currentLineItems.filter((li) => String(li.labor_id) !== '122');
    }

    if (input.mode === 'edit system') {
      const manual = (ctx.manualLineItems ?? []).map((item) => ({ ...item, temp_id: item.id, fetchedFromDb: true }));
      currentLineItems = currentLineItems.concat(manual);
    }

    return { proposal_id: proposalId, system, lineItems: currentLineItems, errors, status: errors.length > 0 ? 'error' : 'success' };
  });

  return { ok: true, proposals, newProposals };
}
