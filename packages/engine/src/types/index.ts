/**
 * Domain types for @sd/engine.
 *
 * These mirror the Postgres tables read by the Retool workflows (equipment_new, labor_new,
 * prices_new, ...) and the JSON payloads the Retool UI posts to the workflows. Column names are
 * kept snake_case on purpose so rows can be passed straight through from a database driver.
 */

/* ------------------------------------------------------------------ */
/* Primitives / enums                                                  */
/* ------------------------------------------------------------------ */

export type PricingStructure = 'standard' | 'ma_forge' | 'ma_laminar' | 'la_standard' | 'ichoosr_2026';

/** Result of getHvacSystemType. null = no HVAC indoor equipment on the line items. */
export type HvacSystemType = 'ducted' | 'ductless' | 'mixed' | null;

/** `systems_new.system_type` as produced by specSystemDetails (`cost_system_type`). */
export type CostSystemType =
  | 'hvac'
  | 'water heater'
  | 'ev'
  | 'energy efficiency'
  | 'cooktop'
  | 'panel'
  | 'adder'
  | 'labor warranty';

export type LineItemType = 'equipment' | 'labor' | 'permit' | 'incentive' | 'discount' | 'maintenance_plan' | (string & {});

export type SystemMode = 'add system' | 'edit system';

/** Plain, serializable error. Mirrors what the Retool workflows returned in `errors`. */
export interface EngineError {
  name: string;
  message: string;
  stack?: string;
  /** Pricing: index of the offending line item in the input array. */
  lineItemIndex?: number;
  /** Original code set `e.fail = false` on recoverable pricing errors. */
  fail?: boolean;
}

/** Failure result used where the Retool workflow ended in `catchErrors`. */
export interface Failure {
  ok: false;
  errors: EngineError[];
}

/* ------------------------------------------------------------------ */
/* Reference data (RefData)                                            */
/* ------------------------------------------------------------------ */

/** A condition entry in `equipment_new.electrical_requirements` (JSONB array). */
export interface ElectricalCondition {
  /** 'item_count' counts equipment already on the job matching `filter`; 'none' always matches. */
  condition_type?: 'item_count' | 'none' | (string & {});
  /** Some rows in prod use camelCase `conditionType` (ignored by the original code). */
  conditionType?: string;
  /** e.g. { equipment_type: ['Branch Box'] } */
  filter?: Record<string, unknown[]>;
  operand?: '=' | '>=' | '<=';
  value?: number;
  /** Normally an array; some prod rows hold a bare object, which the original silently ignored. */
  circuits: Array<{ voltage: number; amperage: number }> | Record<string, unknown>;
}

/** equipment_new / equipment_minimal. */
export interface Equipment {
  id: number;
  equipment_name: string;
  model_number: string | null;
  equipment_type: string;
  model_series?: string | null;
  manufacturer?: string | null;
  provider?: string | null;
  labor_id?: number | null;
  additional_equipment_ids?: number[] | null;
  electrical_requirements?: ElectricalCondition[] | Record<string, never> | null;
  max_indoor_units?: number | null;
  refrigerant?: string | null;
  output_btu?: number | null;
  uef?: number | null;
  is_energystar?: boolean | null;
  heating_tonnage?: number | null;
  capacity_gallons?: number | null;
  cfm?: string | null;
  fan_type?: 'single' | 'dual' | null;
  width?: string | null;
  height?: string | null;
  depth?: string | null;
  decibels?: number | null;
  weight?: number | null;
  power?: string | null;
  rla?: string | null;
  active?: boolean;
}

/** labor_new. */
export interface Labor {
  id: number;
  name: string;
  /** 'hvac' | 'electrical' | 'plumbing' | 'energy efficiency' | 'other' ... (null on newer rows) */
  category?: string | null;
  /** 'circuit' | 'equipment' | 'adder' | 'accessory' | ... */
  subcategory?: string | null;
  labor_hours?: string | number | null;
  circuit_amps?: number | null;
  circuit_voltage?: number | null;
}

export type CircuitPriceType = 'base' | 'per-ft-easy' | 'per-ft-difficult' | 'first-circuit-adder';

/** prices_new. Exactly one of equipment_id / labor_id / maintenance_plan_id is set. */
export interface PriceRow {
  id: number;
  equipment_id?: number | null;
  labor_id?: number | null;
  maintenance_plan_id?: number | null;
  /** 'CO' | 'MA' | 'MA-Laminar' | 'CA' | 'iChoosr26' */
  territory: string;
  /** Price specific to ducted / ductless / mixed HVAC systems; null = applies to all. */
  system_type?: 'ducted' | 'ductless' | 'mixed' | null;
  /** numeric columns may arrive as strings from pg */
  price: number | string;
  /** Circuit labor only. */
  circuit_price_type?: CircuitPriceType | null;
  /** On the 'base' row: cap for base + perFt*length (before first-circuit adder). */
  circuit_price_limit?: number | string | null;
  active_date: string;
  inactive_date?: string | null;
}

/** maintenance_plans_new (columns beyond id/name are not read by any ported code). */
export interface MaintenancePlan {
  id: number;
  name: string;
  [k: string]: unknown;
}

/** ahri_certifications_new. `fuzzy_*` columns hold SQL LIKE patterns. */
export interface AhriCertification {
  id: number;
  certification_type?: string | null; // e.g. 'water heater'
  certification_type_detail?: string | null; // 'ducted' | 'ductless' | 'mixed'
  parent_equipment_id?: string | null;
  child_equipment_id?: string | null;
  furnace_id?: string | null;
  fuzzy_parent_id_opt: string | null;
  fuzzy_child_id_opt: string | null;
  fuzzy_furnace_id_opt: string | null;
  specificity_rank_opt: number | null;
  cooling_95?: number | null;
  heating_47?: number | null;
  is_energystar?: boolean | null;
  [k: string]: unknown;
}

export interface JurisdictionCriterion {
  /** dotted path into the SystemInput, e.g. 'heatPump.condenser.model' */
  path: string;
  operator: 'exists' | '>' | '<' | '>=' | '<=' | '===' | '==' | 'contains_any' | (string & {});
  value?: unknown;
}

/** jurisdiction_rules_new. Adds equipment/labor line items when criteria match the input. */
export interface JurisdictionRule {
  id?: number;
  is_active: boolean;
  state?: string | null;
  city?: string | null;
  criteria: JurisdictionCriterion[] | null;
  multiplier_type?: 'dynamic' | 'static' | null;
  /** dynamic: dotted path into input; static: number */
  multiplier_value?: string | number | null;
  equipment_id?: number | null;
  labor_id?: number | null;
  [k: string]: unknown;
}

/** permits_new. */
export interface PermitRow {
  id: number;
  name: string;
  /** 'hvac' | 'electrical' | 'plumbing' (matches labor.category) */
  permit_type: string;
  jurisdiction: string | null;
  jurisdiction_type: 'state' | 'city' | 'county' | 'other';
  /** Either a flat number, or a % of the HVAC systems' line-item total. */
  price: { cost: number | { multiplier_type: 'hvac'; multiplier_value: number } };
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Incentives (incentives_new / incentive_limits_new)                  */
/* ------------------------------------------------------------------ */

/**
 * One criterion value. string = literal text or operator expression ('>=5', '<=0.5', '=3'; the remainder after the
 * operator must be a pure number, otherwise the whole string is compared literally); number/boolean = loose equality;
 * array = OR over its members; plain object = nested criteria evaluated against the nested data value.
 */
export type CriterionValue = string | number | boolean | CriterionValue[] | { [key: string]: CriterionValue };

/** `{ dottedPathOrField: CriterionValue }` evaluated against ONE data object (a house, an equipment row, ...). */
export type CriteriaGroup = { [path: string]: CriterionValue };

/**
 * `criteria` of one eligibility option. Every key listed here must match (AND):
 * equipment / labor = any line item's catalog row matches; house|home / customer / system / ahri / existing_system = the
 * object matches. `amount.max_amount === 0` is the "explicitly NOT eligible" marker (checked before the keys).
 */
export interface IncentiveCriteria {
  equipment?: CriteriaGroup;
  labor?: CriteriaGroup;
  house?: CriteriaGroup;
  home?: CriteriaGroup;
  customer?: CriteriaGroup;
  existing_system?: CriteriaGroup;
  system?: CriteriaGroup;
  ahri?: CriteriaGroup;
  amount?: { max_amount?: number | null };
  [unknownKey: string]: unknown;
}

export type MultiplierType =
  | 'full install'
  | 'electrical'
  | 'non-electrical'
  | 'furnace cost'
  | 'cooling tonnage rounded 2'
  | 'cooling tonnage rounded down'
  | 'cooling tonnage rounded half ton'
  | 'heating tonnage rounded 2'
  | 'heating47 tonnage rounded 1'
  | 'heating tonnage rounded down'
  | 'tax-federal'
  | '';

export interface IncentiveAmountSpec {
  multiplier_type: MultiplierType | (string & {});
  multiplier_value?: number;
  /** power of 10 (100, 10, 1, 0.1, 0.01 ...). Default 0.01. */
  rounding_place?: number | null;
  max_amount?: number | null;
}

/** One eligibility option: all `criteria` must match; then `amount` says how much. No/empty criteria = always matches. */
export interface IncentiveEligibilityOption {
  criteria?: IncentiveCriteria | null;
  amount: IncentiveAmountSpec;
  [k: string]: unknown;
}

/** `incentive_criteria` JSON: object keyed by option name (e.g. 'option_1') or an array. First fully matching option wins. */
export type IncentiveCriteriaJson = Record<string, IncentiveEligibilityOption> | IncentiveEligibilityOption[];

/** incentives_new (columns of the workflow's `getIncentives.sql`). */
export interface IncentiveRow {
  id: number;
  name: string;
  /** 'rebate' | 'tax credit' | ... (only 'tax credit' is special: second pass). */
  incentive_type: string;
  /** 'homeowner' | 'elephant' | ... copied to the line item's `incentive_recipient`. */
  recipient: string | null;
  /** inclusive window against the system's rebate effective date; null = open. ISO date/datetime strings. */
  active_date: string | null;
  inactive_date: string | null;
  incentive_criteria: IncentiveCriteriaJson | null;
  /** must equal `system.system_type` ('hvac', 'water heater', ...). */
  system_type: string;
  /** flat positive amount of the "Finance Charge for <name>" line item, or null. */
  finance_fee: number | null;
  /** true = this incentive reduces the base of 'tax-federal' multipliers. */
  affects_tax_credit: boolean | null;
  program?: string | null;
  [k: string]: unknown;
}
/** @deprecated alias kept for backward compatibility. */
export type Incentive = IncentiveRow;

/** incentive_limits_new (`incentivesLimitData` in the spec payload). */
export interface IncentiveLimit {
  id: number;
  name: string;
  /** max total $ across the incentives in `incentive_ids` (house wide); null = no amount limit */
  limit_amount: number | null;
  /** max number of incentives; null = no quantity limit */
  limit_number: number | null;
  timeframe: string | null;
  description?: string | null;
  /** number[]; the DB may hand back JSON text ('[1,2]') or CSV ('1,2') */
  incentive_ids: number[] | string;
  eligibility_questions?: Record<string, unknown> | null;
  [k: string]: unknown;
}

/** An IncentiveLimit with the running totals (`getInitializedLimits`). */
export interface InitializedIncentiveLimit {
  id: number;
  name: string;
  limit_amount: number | null;
  limit_number: number | null;
  timeframe: string | null;
  description?: string | null;
  eligibility_questions?: Record<string, unknown> | null;
  incentive_ids: number[];
  received_amount: number;
  received_number: number;
}

/** Row of `getIncentiveForLimits.sql`: incentive lines already on the house. */
export interface IncentiveForLimitsRow {
  price_actual: number | string | null;
  incentive_id: number | null;
}

/**
 * Everything the engine reads from the database. All members are plain arrays of rows exactly as the
 * Retool SQL returned them, so a backend repository layer can implement them 1:1 (see README).
 */
export interface RefData {
  equipment: Equipment[];
  labor: Labor[];
  /** ALL price rows; the engine filters on territory + effective date + system type. */
  prices: PriceRow[];
  maintenancePlans: MaintenancePlan[];
  ahri: AhriCertification[];
  jurisdictionRules: JurisdictionRule[];
  permits: PermitRow[];
  incentives: IncentiveRow[];
  incentiveLimits: IncentiveLimit[];
}

/* ------------------------------------------------------------------ */
/* Houses / systems / line items / proposals                           */
/* ------------------------------------------------------------------ */

export interface House {
  id: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  county?: string | null;
  territory?: string | null;
  market?: string | null;
  customer_id?: number | null;
  electric_utility?: string | null;
  gas_utility?: string | null;
  home_type?: string | null;
  year_built?: number | null;
  sq_footage?: number | null;
  heating_load?: number | null;
  units?: number | null;
  massachusetts_details?: Record<string, unknown> | null;
  colorado_details?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface LineItemAdditionalData {
  electrical?: {
    circuit_length?: number;
    difficult?: boolean;
    treehouse_scoped?: boolean;
    termination?: string | null;
  };
  downflowConfiguration?: boolean;
  branchBoxAssignment?: unknown;
  ahuStageTemps?: unknown;
  branchBoxId?: string | number;
  branchBoxName?: string;
  isTeeJoint?: boolean;
  assignedUnits?: unknown[];
  isManual?: boolean;
  capacity?: { max?: number; used?: number; remaining?: number };
  refrigerant?: string | null;
  [k: string]: unknown;
}

/** line_items_new (plus the transient fields the UI/workflows add). */
export interface LineItem {
  id?: number;
  temp_id?: number | string;
  system_id?: number;
  equipment_id?: number | null;
  labor_id?: number | null;
  permit_id?: number | null;
  incentive_id?: number | null;
  maintenance_plan_id?: number | null;
  line_item_type?: LineItemType;
  description?: string;
  location?: string | null;
  zone_index?: number;
  quantity?: number;
  price_actual?: number | string | null;
  show_in_proposal?: boolean;
  equipment_provider?: string | null;
  additional_data?: LineItemAdditionalData | null;
  status?: string | null;
  /** per-line margin $ (round(target*price/(1-target),2)); not for passthrough types */
  margin_amount?: number | string | null;
  /** per-line margin target overriding system.target_margin; null/undefined = system target */
  margin_percent?: number | string | null;
  /** false = exclude this line from margin; null/undefined = include */
  margin_to_include?: boolean | null;
  /** 'persisted' (saved) | 'transient' (being added) - drives calculateMargin */
  state?: 'persisted' | 'transient' | (string & {}) | null;
  /** set when a human overrode an incentive line; such lines are never recalculated */
  adjustment_reason?: string | null;
  adjustment_explanation?: string | null;
  manually_added?: boolean;
  fetchedFromDb?: boolean;
  incentive_recipient?: 'homeowner' | 'elephant' | string | null;
  [k: string]: unknown;
}

/** A line item after priceLineItems. price_actual is a finite number unless a pricing error was reported. */
export type PricedLineItem = LineItem;

/** systems_new. */
export interface System {
  id?: number;
  house_id: number;
  proposal_id?: number | string | null;
  ahri_id?: number | null;
  system_type: string;
  system_status?: string | null;
  system_type_detail?: SystemTypeDetail | null;
  target_margin?: number | string | null;
  rebate_eligibility_type?: string | null;
  rebate_effective_date?: string | null;
  heating_load_coverage?: number | null;
  additional_data?: Record<string, any> | null;
  [k: string]: unknown;
}

export interface SystemTypeDetail {
  fuel?: 'heat pump' | 'dual fuel' | 'electric' | string;
  switchover_temp?: number;
  heating?: { condensing?: string | null; [k: string]: unknown };
  [k: string]: unknown;
}

/** proposals_new */
export interface Proposal {
  id: number;
  project_id?: number | null;
  house_id?: number | null;
  proposal_status?: string | null;
  nickname?: string | null;
  proposal_created_at?: string | null;
  [k: string]: unknown;
}

/** permits written by specPermits are line items of type 'permit' on the proposal's catch-all ('other') system. */
export interface Permit extends LineItem {
  system_id: number;
  permit_id: number;
  price_actual: number;
  line_item_type: 'permit';
  description: string;
}

/* ------------------------------------------------------------------ */
/* SystemInput - payload of the add/edit system modal                  */
/* ------------------------------------------------------------------ */

export interface ElectricalInput {
  circuitLength?: number;
  difficult?: boolean;
  treehouseScoped?: boolean;
}

export interface AhuUnitInput {
  model: { id: number | null };
  location?: string;
  switchoverTemp?: number | string | null;
  pvcVenting?: boolean;
  heatKit: { id: number | null; enabled: boolean; stageTemps?: { stage1?: number; stage2?: number } };
  thermostat: {
    id: number | null;
    model_number: string | null;
    accessory: { selected_index?: number | null; id: number | null };
  };
  humidifier: { id: number | null; enabled?: boolean };
  /** NOTE: snake_case here (the UI posts circuit_length for AHUs but circuitLength for condensers). */
  electrical: { circuit_length?: number; difficult?: boolean; [k: string]: unknown };
  branchBoxAssignment?: unknown;
  complications: {
    complicated?: boolean;
    condensatePump: { installed?: boolean; circuit?: boolean };
    a2lVentilation?: boolean;
  };
  configuration: { downflow?: boolean };
}

export interface MiniSplitUnitInput {
  model: { id: number | null };
  location?: string;
  thermostat: { accessory: { id: number | null } };
  a2lVentilation?: boolean;
  quiltPanel?: number | null;
  branchBoxAssignment?: unknown;
}

export interface CalculatedBranchBox {
  id: string | number;
  name?: string;
  /** equipment_new.model_number */
  model: string;
  type?: 'tee' | 'branch_box' | string;
  assignedUnits?: unknown[];
  maxCapacity?: number;
  remainingCapacity?: number;
  refrigerant?: string | null;
}

export interface HeatPumpInput {
  condenser: {
    model: number | null;
    location?: string;
    electrical: ElectricalInput;
    serviceOutlet: { enabled: boolean };
  };
  controls: {
    integrated: { enabled: boolean; model: number | null; model_number?: string | null };
    wiresNeeded: number | null;
  };
  kumoSetup?: { spec: boolean; indoorUnitCount: number };
  ahu: { units: AhuUnitInput[]; count: number };
  AHUbranchBoxes?: { outside: { enabled: boolean; count: number } };
  miniSplit: { units: MiniSplitUnitInput[]; count: number; complications: { enabled: boolean } };
  branchBoxes: {
    outside: { enabled: boolean; count: number };
    advanced?: {
      enabled: boolean;
      isManualOverride: boolean;
      totalUnits?: number;
      indoorSeries?: string | null;
      outdoorSeries?: string | null;
      refrigerant?: string | null;
      calculatedBoxes: CalculatedBranchBox[];
      assignments?: unknown;
    };
  };
}

export interface SystemInput {
  mode: SystemMode;
  /** 'CO' here means CHANGE ORDER (not Colorado). */
  state: string;
  cost_system_type: CostSystemType;
  targetMargin: number;
  rebateEligibilityType: string;
  rebateEffectiveDate?: string;
  heatLoadCoverage?: number | null;
  /** change-order only */
  description?: string;
  reason?: string;
  requester?: string;
  timeline?: string | number;
  impact?: string | number;
  respParty?: string;
  customerConsent?: boolean;
  installerConsent?: boolean;
  /** edit mode */
  system_id?: number;
  system_status?: string;

  heatPump: HeatPumpInput;
  HPWH: {
    equipment: { model: number | null; location?: string };
    electrical: ElectricalInput;
    components: {
      locationAdder?: boolean;
      complicationAdder?: boolean;
      condensatePump?: { installed?: boolean; circuit?: boolean };
      tmv?: boolean;
      venting?: boolean;
      serviceOutlet?: boolean;
    };
  };
  energyEfficiency: {
    audit: { enabled: boolean };
    airSealing: { enabled: boolean };
    atticInsulation: { enabled: boolean; squareFeet: number };
    atticAirSealing: { enabled: boolean; squareFeet: number };
    blowerTest: { enabled: boolean };
    crawlspace: { enabled: boolean; squareFeet: number };
    aeroseal: { enabled: boolean; ahuCount: number };
    vaporGuard: { enabled: boolean; squareFeet: number };
  };
  inductionWiring: { labor: { id: number | null }; electrical: ElectricalInput };
  electricalUpgrades: {
    labor: { items: number[]; electrical: { treehouseScoped?: boolean } };
    equipment: { items: number[]; electrical: { treehouseScoped?: boolean } };
  };
  laborWarranty?: { warranty?: { hp_term?: number | string; hpwh_term?: number | string }; manufacturer?: string } | null;
  otherData: { item: { name: string | null; type?: string; laborId: number | null; equipmentId: number | null } };
  evCharging: {
    charger: { model: number | null; location?: string };
    electrical: ElectricalInput & { plugOrHardwired: { value: string | null } };
  };
  specEquipment?: {
    CircuitDifficultBB1?: boolean | null;
    CircuitDifficultBB2?: boolean | null;
    CircuitLengthBB1?: number | null;
    CircuitLengthBB2?: number | null;
    [k: string]: unknown;
  };

  PricingStructure: PricingStructure;
  PricingEffectiveDate?: string;
  pricingEffectiveDate?: string;
  surgeProtection?: 'Whole Home' | 'Single Circuit' | null | string;

  specIncentives: {
    proposal_id: Array<number | string>;
    house: House;
    customer?: Record<string, unknown>;
    project?: Record<string, unknown>;
    ahri_id?: number | null;
    LogAllIncentives?: boolean;
    incentiveIds?: unknown;
    [k: string]: unknown;
  };
  /** system_new rows for the house's existing HVAC (used for the PVC-venting rule). */
  existingHVACRead?: Array<{ system_type_detail?: SystemTypeDetail | null; [k: string]: unknown }>;
  /** labor_new rows the UI loaded (falls back to refData.labor). */
  laborData?: Labor[];
  incentivesLimitData?: IncentiveLimit[];
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Function contexts and results                                       */
/* ------------------------------------------------------------------ */

/** Row shape of the `warrantyCounts` SQL. */
export interface WarrantyCountsRow {
  proposal_id: number;
  fuel_type: string | null;
  condenser_manufacturer: string | null;
  condenser_count: number | string;
  ahu_count: number | string;
  minisplit_count: number | string;
  water_heater_count?: number | string;
  hpwh_count?: number | string;
}

/** Row shape of `checkExistingSurge`. */
export interface SurgeCountRow {
  proposal_id: number;
  count: number | string;
}

/** Existing DB state for the target proposals (the engine never reads a DB itself). */
export interface ExistingProposalData {
  systems: System[];
  lineItems: LineItem[];
}

export interface SpecContext {
  /** Result of the warrantyCounts SQL (or compute via computeWarrantyCounts). Only the first row is used (as in Retool). */
  warrantyCounts?: WarrantyCountsRow[];
  /** Rows of `getManualLineItems` for the edited system (edit mode only). */
  manualLineItems?: LineItem[];
}

export interface NewSystem extends System {
  system_type: string;
  house_id: number;
  system_type_detail: SystemTypeDetail;
  target_margin: number;
  additional_data: Record<string, any>;
}

export interface SpecSystemDetailsOk {
  ok: true;
  /** Un-priced line items (equipment, labor, circuits, ...), descriptions populated. */
  lineItems: LineItem[];
  newSystem: NewSystem;
  ahriRecord: AhriCertification | null;
  system_id?: number;
  errors: EngineError[];
}
export type SpecSystemDetailsResult = SpecSystemDetailsOk | Failure;

export interface SpecEquipmentOptions {
  CircuitDifficultBB1?: boolean | null;
  CircuitDifficultBB2?: boolean | null;
  CircuitLengthBB1?: number | null;
  CircuitLengthBB2?: number | null;
  isManualBBOverride?: boolean;
}

export interface PriceLineItemsOptions {
  pricingStructure: PricingStructure | string;
  /** ISO date / datetime; defaults to `now` (Retool used moment()). */
  pricingEffectiveDate?: string | null;
  /** Injected clock; only used when pricingEffectiveDate is empty. */
  now?: Date | string | number;
  /** Override the HVAC ducting type instead of computing it from the line items. */
  systemType?: HvacSystemType;
}

export interface PriceLineItemsOk {
  ok: true;
  result: PricedLineItem[];
  /** Non-fatal per-line-item pricing errors (no price found, duplicate prices, ...). */
  errors: EngineError[];
  systemType: HvacSystemType;
}
export type PriceLineItemsResult = PriceLineItemsOk | Failure;

/** Description of DB writes the caller must perform (the engine never writes). */
export interface PermitWrites {
  /** New permit line items (no id) to INSERT into line_items_new. */
  inserts: Permit[];
  /** Existing permit line items (id present) to UPDATE (price/description). */
  updates: Permit[];
  /** line_items_new ids to DELETE. */
  deletes: number[];
}

export interface SpecPermitsInput {
  house: House;
  proposalId: number | null | undefined;
  /** systems_new rows for the house (all statuses; filtered like systems.sql). */
  systems: System[];
  /** line_items_new rows for the house's systems (filtered like line_items.sql). */
  lineItems: LineItem[];
}

export interface SpecPermitsOk {
  ok: true;
  /** Same value the Retool block returned (the records upserted into line_items_new). */
  lineItems: Permit[];
  writes: PermitWrites;
  /** Human-readable reasons for early exits (mirrors the console.log lines). */
  notes: string[];
}
export type SpecPermitsResult = SpecPermitsOk | Failure;
