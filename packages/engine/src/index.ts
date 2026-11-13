/**
 * @sd/engine - pure TypeScript port of the System Design Retool workflows.
 * No I/O, no globals: callers pass reference data (RefData) and receive results / write descriptions.
 */
export * from './types';
export { getHvacSystemType, toEquipmentMap, type EquipmentSource } from './pricing/hvacSystemType';
export { priceLineItems, filterActivePrices, TERRITORY_BY_STRUCTURE } from './pricing/priceLineItems';
export { specPermits, selectPermitsForHouse } from './permits/specPermits';
export {
  specEquipment,
  specEquipmentUnsafe,
  getIndoorUnits,
  getOutdoorUnit,
  getAdditionalEquipment,
  type SpecEquipmentResult,
} from './spec/specEquipment';
export { specSystemDetails, specSystemDetailsUnsafe, mapRequiredIds, evaluateCriterion, SURGE_CUTOFF } from './spec/specSystemDetails';
export { findAhriRecord, computeWarrantyCounts, computeSurgeCounts, type AhriQuery } from './spec/ahri';
export {
  specAndPriceSystem,
  parseProposals,
  type SpecAndPriceContext,
  type SpecAndPriceOk,
  type ProposalSpecResult,
  type NewProposalWrite,
} from './spec/specSystem';
export {
  noIncentives,
  type IncentivesProvider,
  type IncentivesProviderArgs,
  type IncentivesProviderResult,
  // margin
  calculateMargin,
  marginForPrice,
  sumMargin,
  marginLine,
  withMarginLine,
  effectiveMargin,
  MARGIN_PASSTHROUGH_TYPES,
  MARGIN_EXCLUDED_STATUSES,
  MARGIN_LINE_DESCRIPTION,
  type CalculateMarginArgs,
  // criteria + limits
  checkCriteria,
  checkCriterion,
  initializeLimits,
  normalizeIncentiveIds,
  applyLimits,
  selectIncentivesForLimits,
  type IncentivesForLimitsQuery,
  // specIncentives
  specIncentives,
  selectPermitCostRows,
  type SpecIncentivesInput,
  type SpecIncentivesContext,
  type SpecIncentivesOk,
  type SpecIncentivesResult,
  type PermitCostRow,
  // provider / recalculate / financing
  createIncentivesProvider,
  type IncentivesProviderExtra,
  recalculateSystem,
  type RecalculateSystemArgs,
  type RecalculateSystemOk,
  calculateFinancingFees,
  FINANCING_PASSTHROUGH_TYPES,
  type SystemWithLineItems,
  type FinancingProject,
  type FinancingFeesResult,
  type FinancingFeeUpsert,
  type FinancingMarginUpdate,
} from './incentives';
export {
  buildProposalData,
  buildAdditionalInfo,
  buildProposalDetails,
  buildHearTotals,
  buildProposalContent,
  buildPdfRequestBody,
  PDF_TEMPLATE_ID,
  type ProposalWorkflowInput,
  type ProposalDbData,
  type ProposalData,
  type AdditionalInfo,
  type ProposalDetail,
  type HearTotals,
  type OptionName,
} from './proposal/buildProposalData';
export { indexById, sqlLike, getNestedValue, toEngineError } from './util';

// Sample data for mocks/tests (tree-shakeable; also available as '@sd/engine/fixtures')
export * from './fixtures';
