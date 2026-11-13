/**
 * ============================================================================
 *  SAMPLE INCENTIVE DATA - INVENTED (except where a comment says otherwise).
 * ============================================================================
 * Rows have the shape of `incentives_new` / `incentive_limits_new` (see `IncentiveRow`). Names and ids of the real programs
 * that appear in the Retool payloads (EnergySmart 19/20, Reading 45, LA DWP 243) are kept; EVERY amount, date and criterion
 * is made up so the engine paths (criteria operators, each multiplier, limits, tax credits, finance fees, EnergySmart cap)
 * can be exercised. Do not use for real quotes. Ids are stable and everything is JSON-serialisable.
 */
import type { IncentiveLimit, IncentiveRow, LineItem, System } from '../types';
import type { SpecIncentivesContext, SpecIncentivesInput } from '../incentives/specIncentives';
import { sampleHouses } from './samples';

type IncentiveDraft = Pick<IncentiveRow, 'id' | 'name' | 'system_type' | 'active_date' | 'incentive_criteria'> & Partial<IncentiveRow>;
const inc = (r: IncentiveDraft): IncentiveRow => ({
  incentive_type: 'rebate',
  recipient: 'homeowner',
  inactive_date: null,
  finance_fee: null,
  affects_tax_credit: false,
  ...r,
});

export const SAMPLE_INCENTIVES: IncentiveRow[] = [
  // --- Colorado: EnergySmart (Boulder county style). Name contains "EnergySmart" -> subject to the 50% project cost cap.
  inc({
    id: 19, name: 'EnergySmart Heat Pump Rebate', program: 'EnergySmart Colorado', system_type: 'hvac', active_date: '2025-01-01',
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'CO', county: ['Boulder', 'Broomfield'] }, equipment: { equipment_type: 'Condenser' } },
        amount: { multiplier_type: 'full install', multiplier_value: 0.4, rounding_place: 1, max_amount: 6000 },
      },
    },
  }),
  inc({
    id: 20, name: 'EnergySmart Heat Pump Water Heater Rebate', program: 'EnergySmart Colorado', system_type: 'water heater', active_date: '2025-01-01',
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'CO' }, equipment: { equipment_type: 'HPWH' } },
        amount: { multiplier_type: 'full install', multiplier_value: 0.25, rounding_place: 1, max_amount: 1000 },
      },
    },
  }),
  // --- Colorado utility heat-pump rebate (cooling tonnage, half-ton rounding, in $100s)
  inc({
    id: 201, name: 'Xcel Energy Air-Source Heat Pump Rebate', program: 'Xcel Energy', system_type: 'hvac', active_date: '2025-01-01', inactive_date: '2027-12-31',
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'CO', electric_utility: ['Xcel', 'Xcel Energy'] }, equipment: { equipment_type: 'Condenser', is_energystar: true } },
        amount: { multiplier_type: 'cooling tonnage rounded half ton', multiplier_value: 400, rounding_place: 10, max_amount: 2000 },
      },
    },
  }),
  // --- Colorado HEAR: income tested; option_1 is an explicit "not eligible" (max_amount 0) for high incomes. Affects the 25C base.
  inc({
    id: 301, name: 'Colorado HEAR - Heat Pump', program: 'Colorado HEAR', system_type: 'hvac', active_date: '2025-01-01', affects_tax_credit: true,
    incentive_criteria: {
      option_1: { criteria: { customer: { annual_gross_income: '>120000' }, amount: { max_amount: 0 } }, amount: { multiplier_type: 'full install', multiplier_value: 0, max_amount: 0 } },
      option_2: {
        criteria: { house: { state: 'CO' }, customer: { annual_gross_income: '<=120000' }, equipment: { equipment_type: 'Condenser' } },
        amount: { multiplier_type: 'non-electrical', multiplier_value: 0.5, rounding_place: 1, max_amount: 8000 },
      },
    },
  }),
  // --- Massachusetts: Mass Save whole-home (option_1 needs an existing oil/propane system; option_2 smaller fallback)
  inc({
    id: 101, name: 'Mass Save Whole-Home Heat Pump Rebate', program: 'Mass Save', system_type: 'hvac', active_date: '2025-01-01', recipient: 'elephant', affects_tax_credit: true,
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'MA' }, existing_system: { fuel: ['oil', 'propane'] }, equipment: { equipment_type: 'Condenser' } },
        amount: { multiplier_type: 'cooling tonnage rounded 2', multiplier_value: 1250, rounding_place: 10, max_amount: 8500 },
      },
      option_2: {
        criteria: { house: { state: 'MA' }, equipment: { equipment_type: 'Condenser', is_energystar: true } },
        amount: { multiplier_type: 'cooling tonnage rounded down', multiplier_value: 500, rounding_place: 10, max_amount: 2500 },
      },
    },
  }),
  inc({
    id: 102, name: 'Mass Save Heat Pump Water Heater Rebate', program: 'Mass Save', system_type: 'water heater', active_date: '2025-01-01', recipient: 'elephant',
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'MA' }, equipment: { equipment_type: 'HPWH' } },
        amount: { multiplier_type: 'full install', multiplier_value: 0.2, rounding_place: 1, max_amount: 750 },
      },
    },
  }),
  // --- Mass Save HEAT loan: carries a finance_fee -> adds a positive "Finance Charge for ..." line
  inc({
    id: 103, name: 'Mass Save HEAT Loan Interest Buydown', program: 'Mass Save', system_type: 'hvac', active_date: '2025-01-01', recipient: 'elephant', finance_fee: 350,
    incentive_criteria: {
      option_1: { criteria: { house: { state: 'MA' } }, amount: { multiplier_type: 'full install', multiplier_value: 0.02, rounding_place: 1, max_amount: 1000 } },
    },
  }),
  // --- Reading (MA): one per household (limit 10); heating tonnage multiplier; criteria on a nested house JSON path
  inc({
    id: 45, name: 'Reading Weatherization Add-on', program: 'Reading Energy', system_type: 'hvac', active_date: '2025-01-01',
    incentive_criteria: {
      option_1: {
        criteria: { house: { city: 'Reading', massachusetts_details: { primaryResidence: true } } },
        amount: { multiplier_type: 'heating47 tonnage rounded 1', multiplier_value: 200, rounding_place: 1, max_amount: 750 },
      },
    },
  }),
  // --- Los Angeles: real name/id from the specIncentives example payload (criteria + amounts invented so that payload yields 4500)
  inc({
    id: 243, name: 'LA Department of Water & Power Heat Pump Rebate', program: 'LADWP', system_type: 'hvac', active_date: '2024-01-01', recipient: 'elephant',
    incentive_criteria: {
      option_1: {
        criteria: { house: { state: 'CA', electric_utility: 'LA Department of Water & Power' }, system: { cooling_95: '>=12000' } },
        amount: { multiplier_type: 'cooling tonnage rounded half ton', multiplier_value: 2250, rounding_place: 1, max_amount: 4500 },
      },
    },
  }),
  // --- Federal 25C-style tax credits: second pass, base = full install + tax-affecting incentives (negative), capped
  inc({
    id: 401, name: 'Federal 25C Heat Pump Tax Credit', program: 'IRS 25C', system_type: 'hvac', incentive_type: 'tax credit', active_date: '2023-01-01', inactive_date: '2032-12-31',
    incentive_criteria: {
      option_1: { criteria: { equipment: { is_energystar: true, equipment_type: ['Condenser', 'AHU'] } }, amount: { multiplier_type: 'tax-federal', multiplier_value: 0.3, rounding_place: 1, max_amount: 2000 } },
    },
  }),
  inc({
    id: 402, name: 'Federal 25C Heat Pump Water Heater Tax Credit', program: 'IRS 25C', system_type: 'water heater', incentive_type: 'tax credit', active_date: '2023-01-01', inactive_date: '2032-12-31',
    incentive_criteria: {
      option_1: { criteria: { equipment: { equipment_type: 'HPWH' } }, amount: { multiplier_type: 'tax-federal', multiplier_value: 0.3, rounding_place: 1, max_amount: 2000 } },
    },
  }),
];

export const SAMPLE_INCENTIVE_LIMITS: IncentiveLimit[] = [
  {
    id: 10, name: 'Reading energy efficiency limit', limit_amount: null, limit_number: 1, timeframe: 'lifetime',
    description: 'One weatherization add-on rebate every 12 years. ', incentive_ids: [45],
    eligibility_questions: { question_1: { index: 1, type: 'radio', text: 'Have you previously received an energy efficiency rebate from Reading Energy for this home?', reponse_options: ['Yes', 'No'] } },
  },
  {
    id: 5, name: 'EnergySmart fuel switch limit', limit_amount: 1500, limit_number: null, timeframe: 'lifetime',
    description: 'This rebate is part of a "fuel switching" rebate category that is capped at $1500 per household.', incentive_ids: [19, 20],
    eligibility_questions: null,
  },
  // INVENTED: one Xcel rebate per household (quantity) ...
  { id: 11, name: 'Xcel one heat pump rebate per household', limit_amount: null, limit_number: 1, timeframe: 'lifetime', description: 'One Xcel heat pump rebate per household.', incentive_ids: [201], eligibility_questions: null },
  // ... and a $10,000 household cap shared by the Mass Save rebates, which ALSO has a quantity limit of 3 (exercises limit ordering)
  { id: 12, name: 'Mass Save household cap', limit_amount: 10000, limit_number: null, timeframe: 'lifetime', description: 'Mass Save rebates are capped at $10,000 per household.', incentive_ids: [101, 102], eligibility_questions: null },
  { id: 13, name: 'Mass Save rebate count', limit_amount: null, limit_number: 3, timeframe: 'lifetime', description: 'At most three Mass Save rebates per household.', incentive_ids: [101, 102, 103], eligibility_questions: null },
];

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** SAMPLE customer row (shape of the `customer` SQL). INVENTED. */
export function sampleCustomer(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 152, first_name: 'Sam', last_name: 'Sample', pipedrive_customer_id: null, hcp_customer_id: null, annual_gross_income: 85000,
    incentive_notes: '', income_verification_status: null, salesforce_account_id: null, referred_by_customer_id: null, tabs_customer_id: null, qbo_customer_id: null,
    ...patch,
  };
}

/** SAMPLE HVAC system row for incentive tests (INVENTED). */
export function sampleIncentiveSystem(patch: Partial<System> = {}): System {
  return {
    id: 5001, house_id: 140, ahri_id: 1, proposal_id: 9919, system_type: 'hvac', system_status: 'proposed', system_type_detail: { fuel: 'heat pump' },
    target_margin: 0.3, rebate_eligibility_type: 'none', rebate_effective_date: null,
    ...patch,
  } as System;
}

let nextLineId = 700000;
/** Build a persisted line item (state 'persisted', no margin yet). */
export function sampleLine(line_item_type: string, price_actual: number, patch: Partial<LineItem> = {}): LineItem {
  return { id: nextLineId++, system_id: 5001, line_item_type, price_actual, quantity: 1, state: 'persisted', status: null, ...patch } as LineItem;
}

/** Deterministic copy of the sample HVAC lines (ids 700001..) - condenser equipment 380 + labor 19, AHU 431, one 240V circuit. */
export function sampleHvacLines(): LineItem[] {
  return [
    { id: 700001, system_id: 5001, line_item_type: 'equipment', equipment_id: 380, description: 'MXZ-SM42NLHZ | Mitsubishi 3.5 Ton SmartMulti HyperHeat Condenser', price_actual: 6277.56, quantity: 1, state: 'persisted', status: null },
    { id: 700002, system_id: 5001, line_item_type: 'labor', labor_id: 19, equipment_id: 380, description: 'Condenser', price_actual: 3500, quantity: 1, state: 'persisted', status: null },
    { id: 700003, system_id: 5001, line_item_type: 'equipment', equipment_id: 431, description: 'SVZ-AP30NL | Mitsubishi M-Series Air Handler', price_actual: 2229.05, quantity: 1, state: 'persisted', status: null },
    { id: 700004, system_id: 5001, line_item_type: 'labor', labor_id: 50, description: '20A 120V Accessory Circuit', price_actual: 400, quantity: 1, state: 'persisted', status: null },
  ];
}

const NOW = '2026-10-15T00:00:00.000Z';

/**
 * Ready-to-run inputs for `specIncentives` / `recalculateSystem` (INVENTED). Each entry is `{ input, ctx }`:
 * `specIncentives(entry.input, sampleRefData, entry.ctx)`.
 */
export const sampleIncentiveInputs: Record<
  'coHeatPump' | 'maHeatPump' | 'laDwpHeatPump' | 'energySmartCap',
  { input: SpecIncentivesInput; ctx: SpecIncentivesContext }
> = {
  /** Broomfield CO, Xcel customer: EnergySmart 19, Xcel 201, HEAR 301, 25C 401 */
  coHeatPump: {
    input: {
      system: sampleIncentiveSystem({ house_id: sampleHouses.co.id }),
      lineItems: sampleHvacLines(),
      house: { ...sampleHouses.co, electric_utility: 'Xcel Energy' },
      customer: sampleCustomer(),
      ahriRecord: { id: 1, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null, specificity_rank_opt: 1, cooling_95: 42000, heating_47: 44000, is_energystar: true },
      proposal_id: 9919, mode: null, existing_system_id: 5001, system_margin: 'add', initialAdd: false,
    },
    ctx: { now: NOW, houseSystems: [], permitLineItems: [{ price_actual: 150, permit_type: 'electrical' }, { price_actual: 210, permit_type: 'hvac' }], incentivesForLimits: [] },
  },
  /** Dover MA house with an existing oil system: Mass Save 101 (option_1), finance-fee incentive 103 */
  maHeatPump: {
    input: {
      system: sampleIncentiveSystem({ house_id: sampleHouses.ma.id }),
      lineItems: sampleHvacLines(),
      house: { ...sampleHouses.ma, massachusetts_details: { primaryResidence: true } },
      customer: sampleCustomer({ id: 157 }),
      ahriRecord: { id: 1, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null, specificity_rank_opt: 1, cooling_95: 42000, heating_47: 44000, is_energystar: true },
      proposal_id: 9919, mode: null, existing_system_id: 5001, system_margin: 'add', initialAdd: false,
    },
    ctx: {
      now: NOW,
      houseSystems: [{ id: 4000, house_id: sampleHouses.ma.id, proposal_id: null, system_type: 'hvac', system_status: 'active', system_type_detail: { heating: { fuel: 'oil' }, cooling: { type: 'central ac' } } } as System],
      permitLineItems: [], incentivesForLimits: [],
    },
  },
  /** The LA payload of legacy/workflows/specIncentives/_exampleInput.json, simplified to sample catalog ids (incentive 243 -> -4500) */
  laDwpHeatPump: {
    input: {
      system: sampleIncentiveSystem({
        id: 66686, house_id: 7895, ahri_id: 2965, proposal_id: 15898, target_margin: '0.2200', is_energystar: true, cooling_95: 22000, heating_47: 25000, certification_type_detail: 'ductless',
      } as Partial<System>),
      lineItems: [
        { id: 582631, system_id: 66686, line_item_type: 'equipment', equipment_id: 13, description: 'ACP3648-3 | Diversitech Concrete Equipment Pad 36x48', price_actual: 142.97, state: 'persisted', status: null },
        { id: 582635, system_id: 66686, line_item_type: 'labor', labor_id: 125, description: 'Kumo Setup (Multi-Indoor Units)', price_actual: 250, state: 'persisted', status: null },
        { id: 582644, system_id: 66686, line_item_type: 'equipment', equipment_id: 380, description: 'Condenser', price_actual: 2514.16, state: 'persisted', status: null },
        { id: 582645, system_id: 66686, line_item_type: 'labor', labor_id: 19, description: 'Condenser', price_actual: 3000, state: 'persisted', status: null },
        { id: 582628, system_id: 66686, line_item_type: 'incentive', incentive_id: 243, incentive_recipient: 'elephant', description: 'LA Department of Water & Power Heat Pump Rebate', price_actual: -4500, margin_amount: 0, state: 'persisted', status: null },
        { id: 582629, system_id: 66686, line_item_type: 'discount', description: 'Summer Discount', price_actual: -750, margin_amount: 0, state: 'persisted', status: null },
        { id: 582646, system_id: 66686, line_item_type: 'margin', description: 'Elephant Margin', price_actual: 1000, margin_amount: 0, state: 'persisted', status: null },
      ],
      house: {
        id: 7895, address: '654 Frontenac Avenue', city: 'Los Angeles', state: 'CA', zipcode: '90065', county: 'Los Angeles', customer_id: 8437,
        electric_utility: 'LA Department of Water & Power', gas_utility: 'Southern California Gas Company', home_type: 'Single Family', year_built: 1929, sq_footage: 821,
      },
      customer: sampleCustomer({ id: 8437, first_name: 'Manuel', last_name: 'Guzman', annual_gross_income: 0 }),
      ahriRecord: { id: 2965, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null, specificity_rank_opt: 1, cooling_95: 22000, heating_47: 25000, is_energystar: true },
      proposal_id: 15898, mode: null, existing_system_id: 66686, rebateEffectiveDate: '2026-11-08T16:46:13.704-0700', system_margin: 'add', initialAdd: false,
    },
    ctx: { now: NOW, houseSystems: [], permitLineItems: [], incentivesForLimits: [] },
  },
  /** Boulder-county CO house whose non-EnergySmart stack (HEAR) is large vs. a small job: exercises the EnergySmart 50% cap */
  energySmartCap: {
    input: {
      system: sampleIncentiveSystem({ house_id: sampleHouses.co.id }),
      lineItems: sampleHvacLines().slice(0, 2),
      house: { ...sampleHouses.co, county: 'Boulder', electric_utility: 'Xcel Energy' },
      customer: sampleCustomer({ annual_gross_income: 60000 }),
      ahriRecord: { id: 1, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null, specificity_rank_opt: 1, cooling_95: 42000, heating_47: 44000, is_energystar: true },
      proposal_id: 9919, mode: null, existing_system_id: 5001, system_margin: 'add', initialAdd: false,
    },
    ctx: { now: NOW, houseSystems: [], permitLineItems: [], incentivesForLimits: [] },
  },
};
