/**
 * SAMPLE houses / systems / line items / function inputs. INVENTED except where noted (the example
 * payloads of the Retool workflows were used as the template). Ids are stable.
 */
import type {
  AhuUnitInput,
  House,
  LineItem,
  MiniSplitUnitInput,
  SpecPermitsInput,
  System,
  SystemInput,
} from '../types';
import type { ProposalDbData, ProposalWorkflowInput } from '../proposal/buildProposalData';

/* ------------------------------ houses ------------------------------ */

const baseHouse = {
  territory: null, market: null, customer_id: 1, electric_utility: null, gas_utility: null, home_type: 'Single Family',
  year_built: 1992, sq_footage: null, heating_load: null, units: 1, massachusetts_details: null, colorado_details: null,
};

export const sampleHouses: Record<'co' | 'ma' | 'ny', House> = {
  /** from specPermits exampleInputJSON (house id 140) */
  co: { ...baseHouse, id: 140, address: '5806 Aspen Creek Drive', city: 'Broomfield', state: 'CO', zipcode: '80020', county: 'Broomfield', customer_id: 152, electric_utility: 'Xcel', gas_utility: 'Xcel', heating_load: 35000, colorado_details: { energy_efficiency: 'na', hear_amount: 'none', energy_smart_co: false } },
  /** from specSystemDetails exampleInputJSON (house id 147) */
  ma: { ...baseHouse, id: 147, address: '12 Main Street', city: 'Dover', state: 'MA', zipcode: '02030', county: 'Norfolk', customer_id: 157, year_built: 1893, massachusetts_details: { energy_audit: null, completed: null, primaryResidence: false } },
  ny: { ...baseHouse, id: 148, address: '1 Sample Avenue', city: 'New York', state: 'NY', zipcode: '10001', county: 'New York', customer_id: 158 },
};

/* ------------------------- system input builders ------------------------- */

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Array<infer U> ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function merge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) out[k] = k in base ? merge((base as any)[k], (patch as any)[k]) : (patch as any)[k];
  return out as T;
}

/** AHU unit with the UI's empty defaults (equipment id 431 = SVZ-AP30NL M-series air handler). */
export function ahuUnit(modelId: number | null, patch: DeepPartial<AhuUnitInput> = {}): AhuUnitInput {
  return merge<AhuUnitInput>(
    {
      model: { id: modelId },
      location: 'Basement',
      switchoverTemp: 0,
      pvcVenting: false,
      heatKit: { id: null, enabled: false, stageTemps: { stage1: 0, stage2: 0 } },
      thermostat: { id: null, model_number: null, accessory: { selected_index: null, id: null } },
      humidifier: { id: null, enabled: false },
      electrical: { circuit_length: 25, difficult: false },
      branchBoxAssignment: null,
      complications: { complicated: false, condensatePump: { installed: false, circuit: false }, a2lVentilation: false },
      configuration: { downflow: false },
    },
    patch,
  );
}

export function miniSplitUnit(modelId: number | null, patch: DeepPartial<MiniSplitUnitInput> = {}): MiniSplitUnitInput {
  return merge<MiniSplitUnitInput>(
    { model: { id: modelId }, location: 'Living Room', thermostat: { accessory: { id: null } }, a2lVentilation: false, quiltPanel: null, branchBoxAssignment: null },
    patch,
  );
}

/** The blank add-system payload (mirrors the example input of the specSystemDetails workflow). */
export function blankSystemInput(): SystemInput {
  return {
    mode: 'add system',
    state: '',
    cost_system_type: 'hvac',
    targetMargin: 0.25,
    rebateEligibilityType: 'none',
    rebateEffectiveDate: '2026-11-11T16:03:40.626-0700',
    heatLoadCoverage: null,
    description: '', reason: '', requester: '', timeline: '', impact: '', respParty: '', customerConsent: false, installerConsent: false,
    heatPump: {
      condenser: { model: null, location: '', electrical: { circuitLength: 25, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: true } },
      controls: { integrated: { enabled: false, model: null, model_number: null }, wiresNeeded: null },
      kumoSetup: { spec: false, indoorUnitCount: 1 },
      ahu: { units: [], count: 0 },
      AHUbranchBoxes: { outside: { enabled: false, count: 0 } },
      miniSplit: { units: [], count: 0, complications: { enabled: false } },
      branchBoxes: {
        outside: { enabled: false, count: 0 },
        advanced: { enabled: false, isManualOverride: false, totalUnits: 0, indoorSeries: null, outdoorSeries: null, refrigerant: null, calculatedBoxes: [], assignments: { ahus: {}, miniSplits: {} } },
      },
    },
    HPWH: {
      equipment: { model: null },
      electrical: { circuitLength: 15, difficult: false, treehouseScoped: false },
      components: { locationAdder: false, complicationAdder: false, condensatePump: { installed: false, circuit: false }, tmv: true, venting: false, serviceOutlet: true },
    },
    energyEfficiency: {
      audit: { enabled: false }, airSealing: { enabled: false }, atticInsulation: { enabled: false, squareFeet: 0 },
      atticAirSealing: { enabled: false, squareFeet: 0 }, blowerTest: { enabled: false }, crawlspace: { enabled: false, squareFeet: 0 },
      aeroseal: { enabled: false, ahuCount: 0 }, vaporGuard: { enabled: false, squareFeet: 0 },
    },
    inductionWiring: { labor: { id: null }, electrical: { circuitLength: 0, difficult: false, treehouseScoped: false } },
    electricalUpgrades: { labor: { items: [], electrical: { treehouseScoped: false } }, equipment: { items: [], electrical: { treehouseScoped: false } } },
    laborWarranty: { warranty: { hp_term: 5 } },
    otherData: { item: { name: '', type: '', laborId: null, equipmentId: null } },
    evCharging: { charger: { model: null, location: '' }, electrical: { circuitLength: 0, difficult: false, plugOrHardwired: { value: null }, treehouseScoped: false } },
    specEquipment: { CircuitDifficultBB2: null, CircuitDifficultBB1: null, CircuitLengthBB2: null, CircuitLengthBB1: null },
    PricingStructure: 'standard',
    PricingEffectiveDate: '2026-10-07',
    specIncentives: { LogAllIncentives: false, proposal_id: [9919], house: sampleHouses.ma },
    existingHVACRead: [{ system_type_detail: { heating: { condensing: null } } }],
    surgeProtection: null,
  };
}

/** Deep-merge `patch` over the blank input. Arrays in `patch` REPLACE the blank arrays. */
export function makeSystemInput(patch: Record<string, unknown> = {}): SystemInput {
  return merge(blankSystemInput(), patch);
}

/* ---------------------------- example inputs ---------------------------- */

const condenserSM42 = { condenser: { model: 380, location: 'Northwest Sideyard', electrical: { circuitLength: 5, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: false } } };

export const sampleSystemInputs = {
  /** Mitsubishi SM condenser + two M-series AHUs with MHK2 thermostats (matches the priceLineItems example). */
  hvacDuctedTwoAhu: makeSystemInput({
    cost_system_type: 'hvac',
    laborWarranty: null,
    heatPump: {
      ...condenserSM42,
      controls: { wiresNeeded: 0 },
      ahu: {
        count: 2,
        units: [
          ahuUnit(431, { electrical: { circuit_length: 50 }, thermostat: { id: 173, model_number: 'MHK2' }, complications: { condensatePump: { circuit: true } } }),
          ahuUnit(430, { electrical: { circuit_length: 50 }, thermostat: { id: 173, model_number: 'MHK2' }, complications: { condensatePump: { circuit: true } } }),
        ],
      },
      miniSplit: { units: [], count: 0 },
    },
    surgeProtection: 'Whole Home',
  }),
  /** SM condenser (R-454B) + 6 M-series wall heads -> 2x 3-port branch box + tee + refrigerant adder. */
  hvacMiniSplitSixHeads: makeSystemInput({
    cost_system_type: 'hvac',
    laborWarranty: null,
    specIncentives: { proposal_id: [9919], house: sampleHouses.co },
    heatPump: {
      condenser: { model: 380, location: 'Side yard', electrical: { circuitLength: 20, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: true } },
      ahu: { units: [], count: 0 },
      miniSplit: { count: 6, complications: { enabled: true }, units: [326, 329, 332, 335, 327, 330].map((id) => miniSplitUnit(id)) },
    },
    specEquipment: { CircuitLengthBB1: 30, CircuitLengthBB2: 45, CircuitDifficultBB1: false, CircuitDifficultBB2: true },
    surgeProtection: 'Single Circuit',
  }),
  /** Bosch condenser + Bosch dual-fuel coil + furnace. */
  hvacDualFuel: makeSystemInput({
    cost_system_type: 'hvac',
    laborWarranty: null,
    heatPump: {
      condenser: { model: 72, location: 'Backyard', electrical: { circuitLength: 30, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: false } },
      ahu: { count: 2, units: [ahuUnit(474), ahuUnit(484, { switchoverTemp: 25 })] },
    },
    existingHVACRead: [{ system_type_detail: { heating: { condensing: 'non-condensing' } } }],
  }),
  hvacSingleMiniSplit: makeSystemInput({
    cost_system_type: 'hvac',
    laborWarranty: null,
    heatPump: {
      condenser: { model: 74, location: 'Side', electrical: { circuitLength: 15, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: false } },
      miniSplit: { count: 1, units: [miniSplitUnit(174)] },
    },
  }),
  /** Water heater: Rheem 50 gal HPWH. */
  waterHeater: makeSystemInput({
    cost_system_type: 'water heater',
    laborWarranty: null,
    HPWH: { equipment: { model: 155, location: 'Basement' }, components: { locationAdder: true } },
    surgeProtection: 'Whole Home',
  }),
  ev: makeSystemInput({
    cost_system_type: 'ev',
    laborWarranty: null,
    evCharging: { charger: { model: 117, location: 'Garage' }, electrical: { circuitLength: 40, plugOrHardwired: { value: 'Hardwired' } } },
  }),
  /** EV circuit only (no charger purchased) */
  evCircuitOnly: makeSystemInput({
    cost_system_type: 'ev',
    laborWarranty: null,
    evCharging: { electrical: { circuitLength: 25, plugOrHardwired: { value: 'Plug' } } },
  }),
  energyEfficiency: makeSystemInput({
    cost_system_type: 'energy efficiency',
    laborWarranty: null,
    energyEfficiency: { audit: { enabled: true }, atticInsulation: { enabled: true, squareFeet: 900 }, aeroseal: { enabled: true, ahuCount: 1 }, blowerTest: { enabled: true } },
  }),
  /** Quick add: electrical panel upgrade. */
  panel: makeSystemInput({
    cost_system_type: 'panel',
    laborWarranty: null,
    electricalUpgrades: { labor: { items: [91] }, equipment: { items: [114] } },
    surgeProtection: 'Whole Home',
  }),
  /** Quick add: induction cooktop wiring (circuit labor 51 = 15A 240V ... any circuit labor id). */
  cooktop: makeSystemInput({
    cost_system_type: 'cooktop',
    laborWarranty: null,
    inductionWiring: { labor: { id: 4 }, electrical: { circuitLength: 20 } },
  }),
  /** Quick add: "other" adder. */
  adder: makeSystemInput({
    cost_system_type: 'adder',
    laborWarranty: null,
    otherData: { item: { name: 'Drywall Touch-Up', type: 'labor', laborId: 42, equipmentId: null } },
  }),
  /** Same as the example payload shipped in the Retool workflow (labor warranty, 5y). */
  laborWarranty: makeSystemInput({ cost_system_type: 'labor warranty', laborWarranty: { warranty: { hp_term: 5 }, manufacturer: 'Mitsubishi' } }),
  /** Change-order version of the first example. */
  changeOrder: makeSystemInput({ state: 'CO', cost_system_type: 'adder', laborWarranty: null, description: 'Add duct cleaning', reason: 'Customer request', requester: 'Customer', timeline: '2', impact: '3', respParty: 'Customer', customerConsent: true, otherData: { item: { name: 'Duct Cleaning', type: 'labor', laborId: 75, equipmentId: null } } }),
} satisfies Record<string, SystemInput>;

/** Edit-mode variant of an input. */
export function asEditInput(input: SystemInput, systemId: number, status = 'proposed'): SystemInput {
  return { ...input, mode: 'edit system', system_id: systemId, system_status: status };
}

/* --------------------------- priceLineItems --------------------------- */

/** Line items from the priceLineItems example payload (condenser + 2 AHUs + circuits; prices stripped). */
export const samplePriceLineItemsInput: { lineItems: LineItem[]; pricingStructure: 'standard'; pricingEffectiveDate: string } = {
  pricingStructure: 'standard',
  pricingEffectiveDate: '2026-06-20',
  lineItems: [
    { equipment_id: 380, location: 'Northwest Sideyard', additional_data: { electrical: { circuit_length: 5, difficult: false, treehouse_scoped: false } }, line_item_type: 'equipment' },
    { labor_id: 19, equipment_id: 380, line_item_type: 'labor' },
    { equipment_id: 38, line_item_type: 'equipment' },
    { equipment_id: 13, line_item_type: 'equipment' },
    { labor_id: 90, show_in_proposal: true, line_item_type: 'labor' },
    { equipment_id: 431, location: 'Basement', zone_index: 0, additional_data: { electrical: { circuit_length: 50, difficult: false }, downflowConfiguration: false }, line_item_type: 'equipment' },
    { labor_id: 20, equipment_id: 431, line_item_type: 'labor' },
    { equipment_id: 173, zone_index: 0, line_item_type: 'equipment' },
    { labor_id: 50, additional_data: { electrical: { circuit_length: 50, difficult: false, termination: 'GFI Outlet' } }, line_item_type: 'labor' },
    { equipment_id: 430, location: 'Basement', zone_index: 1, additional_data: { electrical: { circuit_length: 50, difficult: false }, downflowConfiguration: false }, line_item_type: 'equipment' },
    { labor_id: 20, equipment_id: 430, line_item_type: 'labor' },
    { equipment_id: 173, zone_index: 1, line_item_type: 'equipment' },
    { labor_id: 50, additional_data: { electrical: { circuit_length: 50, difficult: false, termination: 'GFI Outlet' } }, line_item_type: 'labor' },
    { labor_id: 88, line_item_type: 'labor' },
    { equipment_id: 384, line_item_type: 'equipment' },
    { labor_id: 58, equipment_id: 380, additional_data: { electrical: { circuit_length: 5, difficult: false, treehouse_scoped: false } }, line_item_type: 'labor' },
    { labor_id: 4, line_item_type: 'labor', quantity: 2, additional_data: { electrical: { circuit_length: 10, difficult: true } } },
  ],
};

/* ------------------------------ specPermits ------------------------------ */

function permitsScenario(house: House, proposalId: number, firstSystemId: number): SpecPermitsInput {
  const [hvacId, whId, otherId] = [firstSystemId, firstSystemId + 1, firstSystemId + 2];
  const systems: System[] = [
    { id: hvacId, house_id: house.id, proposal_id: proposalId, system_type: 'hvac', system_status: 'proposed' },
    { id: whId, house_id: house.id, proposal_id: proposalId, system_type: 'water heater', system_status: 'proposed' },
    { id: otherId, house_id: house.id, proposal_id: proposalId, system_type: 'other', system_status: 'proposed' },
    // a deleted system and another proposal's system must be ignored
    { id: otherId + 10, house_id: house.id, proposal_id: proposalId, system_type: 'hvac', system_status: 'deleted - from change order' },
    { id: otherId + 11, house_id: house.id, proposal_id: proposalId + 1, system_type: 'hvac', system_status: 'proposed' },
  ];
  const lineItems: LineItem[] = [
    { id: otherId * 10 + 1, system_id: hvacId, equipment_id: 380, line_item_type: 'equipment', price_actual: 6277.56 },
    { id: otherId * 10 + 2, system_id: hvacId, labor_id: 19, equipment_id: 380, line_item_type: 'labor', price_actual: 3500 },
    { id: otherId * 10 + 3, system_id: hvacId, labor_id: 58, equipment_id: 380, line_item_type: 'labor', price_actual: 725 },
    { id: otherId * 10 + 4, system_id: whId, equipment_id: 155, line_item_type: 'equipment', price_actual: 1450 },
    { id: otherId * 10 + 5, system_id: whId, labor_id: 47, line_item_type: 'labor', price_actual: 1200 },
    { id: otherId * 10 + 6, system_id: hvacId, incentive_id: 19, line_item_type: 'incentive', price_actual: -1500 },
    // a pre-existing permit line item (will be updated) and a stale one (will be deleted)
    { id: otherId * 10 + 7, system_id: otherId, permit_id: house.state === 'CO' ? 1 : 4, line_item_type: 'permit', price_actual: 1, description: 'old' },
    { id: otherId * 10 + 8, system_id: otherId, permit_id: 999, line_item_type: 'permit', price_actual: 50, description: 'stale permit' },
  ];
  return { house, proposalId, systems, lineItems };
}

export const samplePermitsInputs = {
  co: permitsScenario(sampleHouses.co, 13807, 7001),
  ma: permitsScenario(sampleHouses.ma, 9919, 7101),
  ny: permitsScenario(sampleHouses.ny, 14001, 7201),
};

/* -------------------------------- proposal -------------------------------- */

/** From the proposalModuleWorkFlow example input, plus a few common optional flags. */
export const sampleProposalInput: ProposalWorkflowInput = {
  date: '7/14/2026',
  filename: 'Joe.Herrick_Proposal.pdf',
  proposalToGenerate: [12522],
  customerName: 'Joe Herrick',
  customerAddress: '924 Grouse Circle Fort Collins, CO 80524',
  customerEmail: 'joecubs@gmail.com',
  hca: 'Allison Toth',
  hcaEmail: 'allison@elephantenergy.com',
  hcaPhone: '(720) 608-3856',
  houseState: 'CO',
  proposalDate: '2026-07-14T16:46:52-0600',
  systemMockUps: false,
  systemMockUpImages: [],
  amountDue: 6958,
  depositAmount: 3479,
  heatPump: 'true',
  hddSlides: 'false',
  hpwh: 1,
};

export const sampleProposalDb: ProposalDbData = {
  optionNames: [{ id: 12522, nickname: 'Option A - Whole Home Heat Pump' }],
  systems: [
    { id: 8001, house_id: 140, proposal_id: 12522, system_type: 'hvac', system_status: 'proposed' },
    { id: 8002, house_id: 140, proposal_id: 12522, system_type: 'water heater', system_status: 'proposed' },
    { id: 8003, house_id: 140, proposal_id: 12522, system_type: 'other', system_status: 'proposed' },
  ],
  lineItems: [
    { id: 1, system_id: 8001, equipment_id: 380, line_item_type: 'equipment', description: 'MXZ-SM42NLHZ | Mitsubishi 3.5 Ton SmartMulti HyperHeat Condenser', price_actual: 6277.56 },
    { id: 2, system_id: 8001, equipment_id: 431, line_item_type: 'equipment', description: 'SVZ-AP30NL | Mitsubishi 2.5 Ton M Series AHU', price_actual: 2229.05 },
    { id: 3, system_id: 8001, equipment_id: 326, line_item_type: 'equipment', description: 'MSZ-EX09NLB | Mitsubishi EX Wall Head', price_actual: 640 },
    { id: 4, system_id: 8002, equipment_id: 155, line_item_type: 'equipment', description: 'PROPH50 T2 RH375-30 | Rheem 50 Gallon Heat Pump Water Heater', price_actual: 1450 },
  ],
  hearProjectBreakdown: [{ total_cost: 14250 }, { total_cost: 3400 }],
  nonHearRebateBreakdown: [{ incentive_amount: 2500 }],
  hearRebateBreakdown: [{ amount: 1000 }],
  projectCostBreakDownAndDesignOptions: {
    projectCostBreakDown: [
      { label: 'Total Cost', value: 17650 },
      { label: '<b>Out-of-Pocket Cost (Amount paid to Elephant or Financed)</b>', value: '<b>$6,958</b>' },
    ],
    designOptions: [[{ name: 'Condenser', description: 'MXZ-SM42NLHZ' }]],
  },
  rmiCalcResults: [{ rmi_calculator_results: { net_cost_1st_year: -120.5, net_cost_lifetime: 4310.25, shareLink: 'https://example.invalid/rmi/abc' } }],
};
