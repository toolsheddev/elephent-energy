import type { AhriCertification, EngineError, ExistingProposalData, House, LineItem, NewSystem, RefData, SystemInput } from '../types';

export interface IncentivesProviderArgs {
  input: SystemInput;
  system: NewSystem;
  proposalId: number | string;
  /** Priced line items for the system (copy; safe to mutate). */
  lineItems: LineItem[];
  /** full reference data (the real provider also needs equipment/labor/ahri) */
  refData: RefData;
  /** AHRI record found by specSystemDetails (the workflow passed it to specIncentives) */
  ahriRecord?: AhriCertification | null;
  /** `input.specIncentives.house` / `.customer` for convenience */
  house?: House;
  customer?: Record<string, unknown> | null;
  /** injected clock of the caller (`SpecAndPriceContext.now`) */
  now?: string | Date;
  /** existing DB rows the caller gave to `specAndPriceSystem` (`ctx.existing`) */
  existing?: ExistingProposalData;
}

export interface IncentivesProviderResult {
  /** Line items INCLUDING any incentive line items (type 'incentive', negative price_actual). */
  result: LineItem[];
  errors?: EngineError[];
}

/**
 * Seam for the `specIncentives` Retool workflow. The original loop called that workflow once per proposal and used its
 * `result` as the final line items. `createIncentivesProvider(refData, extra)` is the real implementation (ported
 * specIncentives); `noIncentives` stays the default.
 */
export type IncentivesProvider = (args: IncentivesProviderArgs) => IncentivesProviderResult;

/** Default stub: no incentives, line items pass through unchanged. */
export const noIncentives: IncentivesProvider = ({ lineItems }) => ({ result: lineItems, errors: [] });

export * from './margin';
export * from './criteria';
export * from './limits';
export * from './specIncentives';
export * from './recalculate';
export * from './financing';
export * from './provider';
