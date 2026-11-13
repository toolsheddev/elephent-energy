/**
 * ============================================================================
 *  SAMPLE DATA - NOT PRODUCTION DATA.
 * ============================================================================
 * A realistic but partly invented reference-data set for exercising @sd/engine and for the web app's
 * mock database.
 *
 *  - Equipment / labor rows (`catalogData.ts`) are curated from the example payloads in the Retool
 *    workflow exports (real ids, model numbers and names, e.g. equipment 380 "MXZ-SM42NLHZ | Mitsubishi
 *    3.5 Ton SmartMulti HyperHeat Condenser", labor 19 "Condenser"). Rows the Retool code looks up but that were
 *    missing from that snapshot (equipment 525-529, 563; three renamed labor rows) are INVENTED.
 *  - Prices: only the prices visible in the example payloads are real (equipment 380 = 6277.56, 431 = 2229.05,
 *    173 = 379.05, 384 = 565.75, labor 19 = 3500, 20 = 4500, circuits 50 & 58); everything else is a deterministic
 *    plausible formula. MA / MA-Laminar / CA / iChoosr26 territories are the CO prices times a factor.
 *  - AHRI certifications, permits, jurisdiction rules, incentives (see `incentives.ts`) and maintenance plans are INVENTED.
 *
 * Ids are stable across releases. Importable in the browser and in Node (no I/O).
 */
import type {
  AhriCertification,
  Equipment,
  JurisdictionRule,
  Labor,
  MaintenancePlan,
  PermitRow,
  PriceRow,
  RefData,
} from '../types';
import { CATALOG_EQUIPMENT, CATALOG_LABOR } from './catalogData';
import { SAMPLE_INCENTIVES, SAMPLE_INCENTIVE_LIMITS } from './incentives';

export const SAMPLE_EQUIPMENT: Equipment[] = CATALOG_EQUIPMENT;
export const SAMPLE_LABOR: Labor[] = CATALOG_LABOR;

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Real prices from the example payloads. */
const EQUIPMENT_PRICE_OVERRIDES: Record<number, number> = { 380: 6277.56, 431: 2229.05, 173: 379.05, 384: 565.75 };
const ZERO_PRICE_EQUIPMENT = new Set([7, 13, 35, 38, 203, 204, 209, 210, 31, 29, 30, 306, 279, 211, 199]);

function equipmentBasePrice(e: Equipment): number {
  if (e.id in EQUIPMENT_PRICE_OVERRIDES) return EQUIPMENT_PRICE_OVERRIDES[e.id];
  if (ZERO_PRICE_EQUIPMENT.has(e.id)) return 0;
  const tons = e.heating_tonnage ?? 2;
  const series = e.model_series;
  const gallons = Number(/(\d+) Gal/i.exec(e.equipment_name)?.[1] ?? 50);
  const kw = Number(/(\d+)kW/i.exec(e.equipment_name)?.[1] ?? 5);
  switch (e.equipment_type) {
    case 'Condenser':
      return r2(series === 'SM' ? 1100 + 1480 * tons : series === 'P' ? 800 + 1000 * tons : series === 'M' ? 600 + 900 * tons : 700 + 1100 * tons);
    case 'AHU':
      return r2(890 * tons);
    case 'Wall Head':
      return r2(380 + 520 * tons);
    case 'Floor Head':
      return r2(600 + 500 * tons);
    case 'Ceiling Cassette':
      return r2(700 + 650 * tons);
    case 'Horizontal-Ducted Head':
      return r2(520 + 560 * tons);
    case 'Dual-Fuel Coil':
      return r2(450 + 220 * tons);
    case 'furnace':
      return 1250;
    case 'HPWH':
      return r2(900 + gallons * 11);
    case 'EV Charger':
      return r2(380 + (e.id % 5) * 55);
    case 'Thermostat':
      return r2(120 + (e.id % 4) * 60);
    case 'Thermostat Accessory':
      return r2(45 + (e.id % 3) * 35);
    case 'Humidifier':
      return r2(250 + (e.id % 6) * 60);
    case 'Heat Kit':
      return r2(180 + 30 * kw);
    case 'Integrated Control':
      return 0;
    case 'Branch Box':
      return e.equipment_name.includes('5-Port') ? 790 : 565.75;
    case 'Header':
      return r2(85 + (e.id % 4) * 45);
    case 'Electrical':
      return ({ 112: 215, 113: 60, 114: 3400, 266: 3150 } as Record<number, number>)[e.id] ?? 100;
    case 'ERV':
      return 1100;
    default:
      return r2(20 + (e.id % 7) * 15);
  }
}

const LABOR_PRICE_OVERRIDES: Record<number, number> = {
  19: 3500, 20: 4500, 21: 2800, 22: 2600, 23: 1800, 24: 1400, 25: 1400, 26: 450, 28: 650, 111: 900, 27: 300,
  46: 1100, 47: 1200, 48: 1300, 49: 1400, 52: 600, 53: 1900, 88: 0, 90: 0,
  14: 450, 15: 350, 16: 180, 17: 160, 18: 90, 34: 220, 89: 220, 29: 500, 30: 600, 31: 700, 73: 150, 74: 800,
  117: 250, 119: 450, 124: 150, 125: 300, 126: 350, 127: 400, 112: 200, 120: 120, 121: 450, 122: 650,
  36: 450, 37: 1800, 38: 2.4, 39: 3.2, 40: 1400, 41: 350, 100: 2.8, 110: 1.1,
  56: 500, 57: 350, 7: 3800, 8: 5200, 9: 1800, 10: 400, 11: 950, 12: 350, 91: 3800, 92: 5200, 93: 6400, 94: 8200, 98: 2600,
  99: 1200, 101: 900, 157: 1900, 158: 2800,
  159: 900, 160: 1500, 162: 2600, 163: 350, 164: 200, 165: 550, 166: 300, 167: 900, 168: 500,
  169: 700, 170: 1200, 171: 1900, 173: 150, 175: 250, 177: 400, 178: 600, 179: 1000, 180: 1600, 181: 1100,
};

interface CircuitPricing { base: number; easy: number; difficult: number; limit: number; adder: number }
const CIRCUIT_OVERRIDES: Record<number, CircuitPricing> = {
  // Reproduces the example payload: labor 50 length 50 -> 250 (+150 first-circuit adder = 400); labor 58 length 5 -> 575
  50: { base: 100, easy: 3, difficult: 5, limit: 600, adder: 150 },
  58: { base: 500, easy: 15, difficult: 25, limit: 2500, adder: 150 },
};
function circuitPricing(l: Labor): CircuitPricing {
  if (CIRCUIT_OVERRIDES[l.id]) return CIRCUIT_OVERRIDES[l.id];
  const base = 100 + 8 * (l.circuit_amps ?? 20);
  const easy = r2(3 + (l.circuit_amps ?? 20) / 10);
  return { base, easy, difficult: r2(easy * 1.7), limit: base * 4, adder: 150 };
}

function laborBasePrice(l: Labor): number {
  if (l.id in LABOR_PRICE_OVERRIDES) return LABOR_PRICE_OVERRIDES[l.id];
  switch (l.subcategory) {
    case 'equipment': return 900;
    case 'adder': return 250;
    case 'accessory': return 120;
    default: return 175;
  }
}

/** [territory, multiplier vs CO] - MA/CA/etc. rows are derived from the CO table. */
const TERRITORY_FACTORS: Array<[string, number]> = [['CO', 1], ['MA', 1.12], ['MA-Laminar', 1.08], ['CA', 1.15], ['iChoosr26', 0.95]];

export function buildSamplePrices(equipment: Equipment[], labor: Labor[]): PriceRow[] {
  const rows: PriceRow[] = [];
  let id = 1;
  const add = (p: Omit<PriceRow, 'id'>) => rows.push({ id: id++, ...p });
  const common = { active_date: '2025-01-01', inactive_date: null };
  for (const [territory, f] of TERRITORY_FACTORS) {
    for (const e of equipment) {
      add({ equipment_id: e.id, territory, system_type: null, price: r2(equipmentBasePrice(e) * f), ...common });
    }
    for (const l of labor) {
      if (l.subcategory === 'circuit') {
        const c = circuitPricing(l);
        add({ labor_id: l.id, territory, system_type: null, price: r2(c.base * f), circuit_price_type: 'base', circuit_price_limit: r2(c.limit * f), ...common });
        add({ labor_id: l.id, territory, system_type: null, price: r2(c.easy * f), circuit_price_type: 'per-ft-easy', ...common });
        add({ labor_id: l.id, territory, system_type: null, price: r2(c.difficult * f), circuit_price_type: 'per-ft-difficult', ...common });
        add({ labor_id: l.id, territory, system_type: null, price: r2(c.adder * f), circuit_price_type: 'first-circuit-adder', ...common });
      } else {
        add({ labor_id: l.id, territory, system_type: null, price: r2(laborBasePrice(l) * f), ...common });
      }
    }
    // system-type specific labor prices (ducted vs ductless install)
    add({ labor_id: 19, territory, system_type: 'ductless', price: r2(3250 * f), ...common });
    add({ labor_id: 19, territory, system_type: 'mixed', price: r2(3800 * f), ...common });
    add({ labor_id: 20, territory, system_type: 'mixed', price: r2(4700 * f), ...common });
    // maintenance plans
    for (const mp of SAMPLE_MAINTENANCE_PLANS) add({ maintenance_plan_id: mp.id, territory, system_type: null, price: r2(mp.annual_price * f), ...common });
  }
  // an expired price row (superseded) to exercise the effective-date filter
  add({ equipment_id: 380, territory: 'CO', system_type: null, price: 5999, active_date: '2024-01-01', inactive_date: '2025-01-01' });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Maintenance plans                                                   */
/* ------------------------------------------------------------------ */

/** Ids 1-3 are the base plans (names and CO prices as seen in Retool). The additional-unit and add-on options (ids 4-15) are SAMPLE rows:
 *  Retool's specMaintPlan needs them (levels x additional_condenser / additional_ahu / additional_head, plus the add-ons), but their
 *  names and prices were not provided. They are scaled from the base price and must be replaced with the real rows. */
const MP_LEVELS: Array<{ level: string; label: string; base: number }> = [
  { level: 'silver', label: 'Silver', base: 199 }, { level: 'gold', label: 'Gold', base: 299 }, { level: 'platinum', label: 'Platinum', base: 449 },
];
export const SAMPLE_MAINTENANCE_PLANS: Array<MaintenancePlan & { annual_price: number }> = [
  { id: 1, name: 'Silver Maintenance Plan', annual_price: 199, plan_level: 'silver', type: 'base' },
  { id: 2, name: 'Gold Maintenance Plan', annual_price: 299, plan_level: 'gold', type: 'base' },
  { id: 3, name: 'Platinum Maintenance Plan (Extended Labor Warranty)', annual_price: 449, plan_level: 'platinum', type: 'base' },
  ...([['additional_condenser', 'Additional Condenser', 0.5], ['additional_ahu', 'Additional Air Handler', 0.25], ['additional_head', 'Additional Head', 0.15]] as const)
    .flatMap(([type, label, ratio], t) => MP_LEVELS.map((l, i) => ({
      id: 4 + t * 3 + i, name: `${l.label} Plan: ${label}`, annual_price: Math.round(l.base * ratio), plan_level: l.level, type,
    }))),
  { id: 13, name: 'SmartAC Add-on', annual_price: 49, plan_level: null, type: 'addon_smartac' },
  { id: 14, name: 'Heat Pump Water Heater Add-on', annual_price: 99, plan_level: null, type: 'addon_hpwh' },
  { id: 15, name: 'ERV Add-on', annual_price: 79, plan_level: null, type: 'addon_erv' },
];

/* ------------------------------------------------------------------ */
/* AHRI certifications (INVENTED)                                      */
/* ------------------------------------------------------------------ */

export function buildSampleAhri(equipment: Equipment[]): AhriCertification[] {
  const rows: AhriCertification[] = [];
  let id = 1;
  const base = (parent: string) => ({
    certification_type: 'system',
    parent_equipment_id: parent,
    fuzzy_parent_id_opt: parent.split('.TH').join('') + '%',
    cooling_95: 36000,
    heating_47: 38000,
    is_energystar: true,
  });
  for (const c of equipment.filter((e) => e.equipment_type === 'Condenser' && e.model_number)) {
    const m = c.model_number as string;
    // ductless (heads): any child
    rows.push({ id: id++, ...base(m), certification_type_detail: 'ductless', child_equipment_id: null, furnace_id: null, fuzzy_child_id_opt: '%', fuzzy_furnace_id_opt: null, specificity_rank_opt: 1 });
    // ducted: generic + specific (SVZ / PVA / PVFY / PEAD / Bosch) air handlers
    rows.push({ id: id++, ...base(m), certification_type_detail: 'ducted', child_equipment_id: null, furnace_id: null, fuzzy_child_id_opt: '%', fuzzy_furnace_id_opt: null, specificity_rank_opt: 1 });
    rows.push({ id: id++, ...base(m), certification_type_detail: 'ducted', child_equipment_id: 'SVZ-%', furnace_id: null, fuzzy_child_id_opt: 'SVZ-%', fuzzy_furnace_id_opt: null, specificity_rank_opt: 3 });
    rows.push({ id: id++, ...base(m), certification_type_detail: 'ducted', child_equipment_id: 'PVA-%', furnace_id: null, fuzzy_child_id_opt: 'PVA-%', fuzzy_furnace_id_opt: null, specificity_rank_opt: 3 });
    // mixed ducted + ductless
    rows.push({ id: id++, ...base(m), certification_type_detail: 'mixed', child_equipment_id: null, furnace_id: null, fuzzy_child_id_opt: '%', fuzzy_furnace_id_opt: null, specificity_rank_opt: 1 });
    // dual fuel (coil + furnace)
    for (const coil of ['BMAC%', 'PAA-%']) {
      rows.push({ id: id++, ...base(m), certification_type_detail: 'ducted', child_equipment_id: coil, furnace_id: 'BGH%', fuzzy_child_id_opt: coil, fuzzy_furnace_id_opt: 'BGH%', specificity_rank_opt: 5 });
    }
  }
  for (const w of equipment.filter((e) => e.equipment_type === 'HPWH' && e.model_number)) {
    rows.push({
      id: id++, certification_type: 'water heater', certification_type_detail: null, parent_equipment_id: w.model_number as string,
      child_equipment_id: null, furnace_id: null, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null,
      specificity_rank_opt: 1, is_energystar: true,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Jurisdiction rules, permits, incentives (INVENTED)                  */
/* ------------------------------------------------------------------ */

export const SAMPLE_JURISDICTION_RULES: JurisdictionRule[] = [
  // MA requires AFCI breakers when an HVAC system is added (labor 74 "Upgrade MPU to AFCI Breakers")
  { id: 1, is_active: true, state: 'MA', city: null, criteria: [{ path: 'cost_system_type', operator: '===', value: 'hvac' }], multiplier_type: 'static', multiplier_value: 1, equipment_id: null, labor_id: 74 },
  // Boulder, CO: refrigerant ball valve on any mini-split job (labor 140)
  { id: 2, is_active: true, state: 'CO', city: 'Boulder', criteria: [{ path: 'cost_system_type', operator: '===', value: 'hvac' }, { path: 'heatPump.miniSplit.count', operator: '>=', value: 1 }], multiplier_type: 'dynamic', multiplier_value: 'heatPump.miniSplit.count', equipment_id: null, labor_id: 140 },
  // disabled sample: exercises is_active handling
  { id: 3, is_active: false, state: null, city: null, criteria: [{ path: 'heatPump.ahu.count', operator: '>=', value: 1 }], multiplier_type: 'static', multiplier_value: 1, equipment_id: null, labor_id: 87 },
];

export const SAMPLE_PERMITS: PermitRow[] = [
  { id: 1, name: 'Colorado HVAC Permit', permit_type: 'hvac', jurisdiction: 'CO', jurisdiction_type: 'state', price: { cost: { multiplier_type: 'hvac', multiplier_value: 0.02 } } },
  { id: 2, name: 'Colorado Electrical Permit', permit_type: 'electrical', jurisdiction: 'CO', jurisdiction_type: 'state', price: { cost: 150 } },
  { id: 3, name: 'Colorado Plumbing Permit', permit_type: 'plumbing', jurisdiction: 'CO', jurisdiction_type: 'state', price: { cost: 175 } },
  { id: 4, name: 'Massachusetts Mechanical Permit', permit_type: 'hvac', jurisdiction: 'MA', jurisdiction_type: 'state', price: { cost: 250 } },
  { id: 5, name: 'Massachusetts Electrical Permit', permit_type: 'electrical', jurisdiction: 'MA', jurisdiction_type: 'state', price: { cost: 200 } },
  { id: 6, name: 'Massachusetts Plumbing Permit', permit_type: 'plumbing', jurisdiction: 'MA', jurisdiction_type: 'state', price: { cost: 180 } },
  { id: 7, name: 'New York HVAC Permit', permit_type: 'hvac', jurisdiction: 'NY', jurisdiction_type: 'state', price: { cost: 300 } },
  { id: 8, name: 'New York Electrical Permit', permit_type: 'electrical', jurisdiction: 'NY', jurisdiction_type: 'state', price: { cost: 225 } },
  { id: 9, name: 'City of New York Plumbing Permit', permit_type: 'plumbing', jurisdiction: 'New York', jurisdiction_type: 'city', price: { cost: 260 } },
  { id: 10, name: 'Westchester County HVAC Permit', permit_type: 'hvac', jurisdiction: 'Westchester', jurisdiction_type: 'county', price: { cost: 350 } },
  { id: 11, name: 'Default Plumbing Permit', permit_type: 'plumbing', jurisdiction: null, jurisdiction_type: 'other', price: { cost: 140 } },
  { id: 12, name: 'Default Electrical Permit', permit_type: 'electrical', jurisdiction: null, jurisdiction_type: 'other', price: { cost: 120 } },
];

/* ------------------------------------------------------------------ */
/* Assembled RefData                                                   */
/* ------------------------------------------------------------------ */

export function buildSampleRefData(): RefData {
  return {
    equipment: SAMPLE_EQUIPMENT,
    labor: SAMPLE_LABOR,
    prices: buildSamplePrices(SAMPLE_EQUIPMENT, SAMPLE_LABOR),
    maintenancePlans: SAMPLE_MAINTENANCE_PLANS.map(({ annual_price: _p, ...rest }) => rest),
    ahri: buildSampleAhri(SAMPLE_EQUIPMENT),
    jurisdictionRules: SAMPLE_JURISDICTION_RULES,
    permits: SAMPLE_PERMITS,
    incentives: SAMPLE_INCENTIVES,
    incentiveLimits: SAMPLE_INCENTIVE_LIMITS,
  };
}

/** SAMPLE RefData (built once at import time; deterministic). */
export const sampleRefData: RefData = buildSampleRefData();
