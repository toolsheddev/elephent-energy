/* Differential tests for adding a system, against Retool's ORIGINAL workflow code run unmodified with its globals mocked:
   - priceLineItems   (legacy/workflows/specSystemDetails/priceLineItems.js, the variant that also knows ichoosr_2026)
   - specSystemDetails (legacy/workflows/specSystemDetails/specSystemDetails.js) together with its specEquipment and getHvacSystemType blocks
   The SQL the workflows run (prices_all, ahri) is re-implemented here independently of the port. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ahuUnit, makeSystemInput, miniSplitUnit, priceLineItems, sampleRefData, specSystemDetails, type SystemInput } from '../src';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<any>;
const wf = (p: string) => readFileSync(new URL(`../../../legacy/workflows/${p}`, import.meta.url), 'utf8');
const PRICE = wf('specSystemDetails/priceLineItems.js');
const HVAC_TYPE = wf('specSystemDetails/getHvacSystemType.js');
const SPEC_EQ = wf('specSystemDetails/specEquipment.js');
const SPEC_SYS = wf('specSystemDetails/specSystemDetails.js');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const num = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const byId = <T extends { id: number }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));

/* ---- the original getHvacSystemType block, as the function the workflow calls ---- */
const originalHvacType = async (lineItems: any[], equipmentData: any) => ({ data: await new AsyncFunction('lineItems1', 'equipmentData1', 'console', HVAC_TYPE)(clone(lineItems), equipmentData, silent) });

/* ---- SQL: prices_all (active_date <= d AND (inactive_date IS NULL OR inactive_date > d)) ---- */
const pricesAll = (prices: any[]) => async (date: string) => ({ data: clone(prices.filter((p) => new Date(p.active_date) <= new Date(date) && (p.inactive_date == null || new Date(p.inactive_date) > new Date(date)))) });

describe('priceLineItems: original Retool code vs the port', () => {
  const N = 800;
  it(`${N} random line sets get the same prices and errors`, async () => {
    const bad: string[] = [];
    const cover: Record<string, number> = {};
    const hit = (k: string) => { cover[k] = (cover[k] ?? 0) + 1; };
    const eq = sampleRefData.equipment, lab = sampleRefData.labor;
    const circuits = lab.filter((l) => l.subcategory === 'circuit');
    const plain = lab.filter((l) => l.subcategory !== 'circuit');
    const types = ['AHU', 'Condenser', 'Wall Head', 'Ceiling Cassette', 'Floor Head', 'Dual-Fuel Coil', 'Horizontal-Ducted Head', 'HPWH', 'Thermostat', 'Accessory'];
    for (let seed = 1; seed <= N; seed++) {
      const r = rng(seed * 6007);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const chance = (p: number) => r() < p;
      const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
      const lines: any[] = [];
      for (let i = 0; i < int(1, 9); i++) {
        const k = pick(['equipment', 'equipment', 'labor', 'circuit', 'circuit', 'mp', 'discount', 'permit']);
        const q = chance(0.2) ? int(2, 3) : undefined;
        if (k === 'equipment') { const t = pick(types); lines.push({ line_item_type: 'equipment', equipment_id: pick(eq.filter((e) => e.equipment_type === t)).id, quantity: q, price_actual: 1 }); }
        else if (k === 'labor') lines.push({ line_item_type: 'labor', labor_id: pick(plain).id, quantity: q, price_actual: 1 });
        else if (k === 'circuit') lines.push({ line_item_type: 'labor', labor_id: pick(circuits).id, quantity: q, price_actual: 1, additional_data: { electrical: { circuit_length: chance(0.1) ? undefined : int(0, 120), difficult: chance(0.4) } } });
        else if (k === 'mp') lines.push({ line_item_type: 'maintenance plan', maintenance_plan_id: pick([1, 2, 3, 99]), quantity: q, price_actual: 1 });
        else if (k === 'discount') lines.push({ line_item_type: 'discount', price_actual: -int(10, 500), quantity: q });
        else lines.push({ line_item_type: 'permit', permit_id: 3, price_actual: 123, equipment_id: null, labor_id: null }); // original: becomes NaN (documented deviation)
      }
      const structure = pick(['standard', 'standard', 'ma_forge', 'ma_laminar', 'la_standard', 'ichoosr_2026', 'bogus']);
      const date = pick(['2026-10-07', '2025-03-01', '2024-06-01', '2030-01-01']);
      let prices = clone(sampleRefData.prices) as any[];
      if (chance(0.3)) prices = prices.filter(() => !chance(0.02)); // missing prices
      if (chance(0.15)) { const d = pick(prices); prices.push({ ...d, id: 99999 }); } // a duplicate price row
      const equipmentData = byId(eq), laborData = byId(lab);

      // ---- original ----
      let orig: any, origErr: string | null = null;
      try {
        const startTrigger = { data: { PricingEffectiveDate: date, PricingStructure: structure } };
        const specSystemDetails = { data: { equipmentData, laborData, lineItems: clone(lines) } };
        orig = await new AsyncFunction('startTrigger', 'specSystemDetails', 'prices_all', 'getHvacSystemType', 'console', PRICE)(startTrigger, specSystemDetails, pricesAll(prices), originalHvacType, silent);
      } catch (e: any) { origErr = String(e?.message ?? e); }
      // ---- port ----
      const ts = priceLineItems(clone(lines), { equipment: eq, labor: lab, prices } as any, { pricingStructure: structure, pricingEffectiveDate: date });
      if (origErr) { if (ts.ok) bad.push(`seed ${seed}: original threw "${origErr.slice(0, 90)}" but the port returned`); continue; }
      if (!ts.ok) { bad.push(`seed ${seed}: port failed "${ts.errors[0]?.message}" but the original returned`); continue; }
      hit('scenarios'); if ((orig.errors as any[]).length) hit('with a pricing error'); if (structure === 'ichoosr_2026') hit('ichoosr_2026'); if (lines.some((l) => l.additional_data)) hit('circuit priced');
      const skip = (l: any) => !l.labor_id && !l.equipment_id && !l.maintenance_plan_id && l.line_item_type !== 'discount'; // the port keeps these prices instead of NaN
      const a = (orig.result as any[]).map((l: any, i: number) => (skip(lines[i]) ? null : num(l.price_actual)));
      const b = ts.result.map((l, i) => (skip(lines[i]) ? null : num(l.price_actual)));
      if (JSON.stringify(a) !== JSON.stringify(b)) { bad.push(`seed ${seed} (${structure}, ${date}): prices differ\n   orig ${JSON.stringify(a)}\n   port ${JSON.stringify(b)}`); continue; }
      const ea = (orig.errors as any[]).map((e) => e.message).sort(), eb = ts.errors.map((e) => e.message).sort();
      if (structure === 'bogus') {
        // The original throws "not a valid pricing structure" from inside a filter, so a line with no candidate price rows reports "No price found" instead.
        // The outcome is the same (that line fails and keeps its price); only the wording differs.
        if (ea.length !== eb.length) bad.push(`seed ${seed}: invalid structure, error counts differ ${ea.length} vs ${eb.length}`); else hit('invalid structure: same failures, different wording');
      } else if (JSON.stringify(ea) !== JSON.stringify(eb)) bad.push(`seed ${seed}: errors differ\n   orig ${JSON.stringify(ea).slice(0, 260)}\n   port ${JSON.stringify(eb).slice(0, 260)}`);
    }
    console.log('priceLineItems coverage:', JSON.stringify(cover));
    if (bad.length) console.log(`${bad.length} differ:\n` + bad.slice(0, 8).join('\n'));
    expect(bad.length).toBe(0);
  }, 180_000);
});

/* ------------------------------------------------------------------ */
/* specSystemDetails                                                   */
/* ------------------------------------------------------------------ */

const sqlLike = (v: string | null | undefined, pattern: string | null | undefined) => {
  if (v == null || pattern == null) return false;
  const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '[\\s\\S]') + '$');
  return re.test(v);
};
/** The `ahri` query, written from the SQL text. */
const ahriSql = (rows: any[]) => async (condenser: string | null, indoor: string | null, ducting: string | null, furnace: string | null, coil: string | null, waterHeater: string | null) => {
  const cond = String(condenser ?? '').split('.TH').join('');
  const hit = rows.filter((a) => {
    const hvac = sqlLike(cond, a.fuzzy_parent_id_opt)
      && ((furnace != null && sqlLike(coil, a.fuzzy_child_id_opt) && sqlLike(furnace, a.fuzzy_furnace_id_opt))
        || (furnace == null && (sqlLike(indoor, a.fuzzy_child_id_opt) || a.child_equipment_id === '' || a.child_equipment_id == null) && (a.furnace_id == null || a.furnace_id === '' || a.furnace_id === '%')))
      && ducting != null && ducting === a.certification_type_detail;
    const wh = a.certification_type === 'water heater' && sqlLike(a.parent_equipment_id, '%' + waterHeater + '%');
    return hvac || wh;
  });
  hit.sort((x, y) => (y.specificity_rank_opt ?? Infinity) - (x.specificity_rank_opt ?? Infinity)); // PostgreSQL: NULLs sort first in DESC
  return { data: clone(hit.slice(0, 1)) };
};

function randomInput(seed: number): { input: SystemInput; warranty: any[] } {
  const r = rng(seed * 15485863);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const eq = sampleRefData.equipment, lab = sampleRefData.labor;
  const ids = (t: string) => eq.filter((e) => e.equipment_type === t).map((e) => e.id);
  const orNull = <T,>(x: T, p = 0.1): T | null => (chance(p) ? null : x);
  const type = pick(['hvac', 'hvac', 'hvac', 'hvac', 'water heater', 'water heater', 'ev', 'panel', 'cooktop', 'energy efficiency', 'adder', 'labor warranty']);
  const electricalLabor = lab.filter((l) => l.category === 'electrical');
  const elec = () => ({ circuitLength: int(0, 120), difficult: chance(0.3), treehouseScoped: chance(0.15) });

  const ahuCount = type === 'hvac' ? pick([0, 1, 1, 2, 3]) : 0;
  const msCount = type === 'hvac' ? pick([0, 0, 1, 2, 3, 4, 6, 7]) : 0;
  const heads = [...ids('Wall Head'), ...ids('Ceiling Cassette'), ...ids('Floor Head')];
  const ahuTypes = [...ids('AHU'), ...ids('Dual-Fuel Coil'), ...ids('Horizontal-Ducted Head'), ...ids('furnace')];
  const patch: Record<string, unknown> = {
    cost_system_type: type, mode: pick(['add system', 'add system', 'edit system']), state: chance(0.1) ? 'CO' : '', targetMargin: pick([0.2, 0.25, 0.3]),
    PricingStructure: pick(['standard', 'standard', 'ma_forge', 'la_standard']), PricingEffectiveDate: pick(['2026-10-07', '2025-12-01', '2025-09-01']),
    surgeProtection: pick([null, null, 'Whole Home', 'Single Circuit']), system_status: 'proposed', system_id: 5001,
    description: 'd', reason: 'r', requester: 'q', timeline: '2', impact: '1', respParty: 'x', customerConsent: chance(0.5), installerConsent: chance(0.5),
    specIncentives: { LogAllIncentives: false, proposal_id: [9919], house: { id: 140, state: pick(['CO', 'MA']) } },
    specEquipment: { CircuitDifficultBB2: orNull(chance(0.5), 0.5), CircuitDifficultBB1: orNull(chance(0.5), 0.5), CircuitLengthBB2: orNull(int(0, 60), 0.4), CircuitLengthBB1: orNull(int(0, 60), 0.4) },
    existingHVACRead: [{ system_type_detail: { heating: { condensing: pick([null, 'condensing', 'non-condensing']) } } }],
  };
  if (type === 'hvac') {
    const units = Array.from({ length: ahuCount }, () => ahuUnit(orNull(pick(ahuTypes)) as any, {
      location: pick(['Basement', 'Attic', '']), switchoverTemp: pick([0, 25, null as any]), pvcVenting: chance(0.2),
      heatKit: { id: chance(0.4) ? pick(ids('Heat Kit')) : null, enabled: chance(0.4), stageTemps: { stage1: 0, stage2: 0 } },
      thermostat: { id: orNull(pick(ids('Thermostat')), 0.2), model_number: 'x', accessory: { selected_index: null, id: orNull(pick(ids('Thermostat Accessory')), 0.7) } },
      humidifier: { id: chance(0.3) ? pick(eq.filter((e) => /humidif/i.test(String(e.equipment_name))).map((e) => e.id).concat([1])) : null, enabled: chance(0.3) },
      electrical: { circuit_length: int(0, 100), difficult: chance(0.3) },
      complications: { complicated: chance(0.25), condensatePump: { installed: chance(0.3), circuit: chance(0.3) }, a2lVentilation: chance(0.2) },
      configuration: { downflow: chance(0.15) },
    }));
    const ms = Array.from({ length: msCount }, () => miniSplitUnit(orNull(pick(heads)) as any, { location: pick(['Living Room', 'Bedroom']), thermostat: { accessory: { id: orNull(pick(ids('Thermostat Accessory')), 0.8) } }, a2lVentilation: chance(0.2), quiltPanel: chance(0.2) ? int(1, 3) : null }));
    const adv = chance(0.3);
    const boxModels = ['PAC-MKA32BC', 'PAC-MKA52BC', 'PAC-LMA30BC', 'PAC-LMA50BC', 'MSDD-50AR-E', 'MSDD-50AR2-E', 'CMY-Y64-G-E'];
    const manual = chance(0.4);
    patch.heatPump = {
      condenser: { model: orNull(pick(ids('Condenser')), 0.05), location: pick(['', 'Side yard']), electrical: elec(), serviceOutlet: { enabled: chance(0.4) } },
      controls: { integrated: { enabled: chance(0.15), model: pick(ids('Thermostat')), model_number: 'x' }, wiresNeeded: pick([null, 0, 2]) },
      kumoSetup: { spec: chance(0.3), indoorUnitCount: int(0, 3) },
      ahu: { units, count: ahuCount },
      AHUbranchBoxes: { outside: { enabled: chance(0.2), count: int(0, 2) } },
      miniSplit: { units: ms, count: msCount, complications: { enabled: chance(0.3) } },
      branchBoxes: {
        outside: { enabled: chance(0.2), count: int(0, 2) },
        advanced: adv ? { enabled: true, isManualOverride: manual, totalUnits: ahuCount + msCount, indoorSeries: 'M', outdoorSeries: 'SM', refrigerant: 'R-454B',
          calculatedBoxes: Array.from({ length: int(1, 3) }, (_, i) => ({ id: 'b' + i, name: 'Box ' + i, model: pick(boxModels), type: pick(['3-port', 'tee', '5-port']), maxCapacity: 3, assignedUnits: [] })), assignments: {} }
          : { enabled: false, isManualOverride: false, calculatedBoxes: [] },
      },
    };
  }
  if (type === 'water heater') patch.HPWH = {
    equipment: { model: orNull(pick(ids('HPWH')), 0.05), location: pick(['', 'Basement']) }, electrical: elec(),
    components: { locationAdder: chance(0.4), complicationAdder: chance(0.3), condensatePump: { installed: chance(0.3), circuit: chance(0.3) }, tmv: chance(0.5), venting: chance(0.3), serviceOutlet: chance(0.4) },
  };
  if (type === 'ev') patch.evCharging = { charger: { model: orNull(pick(ids('EV Charger')), 0.4), location: 'Garage' }, electrical: { ...elec(), plugOrHardwired: { value: pick(['Plug', 'Hardwired', null]) } } };
  if (type === 'panel') patch.electricalUpgrades = { labor: { items: Array.from({ length: int(0, 3) }, () => pick(electricalLabor).id), electrical: { treehouseScoped: chance(0.2) } }, equipment: { items: Array.from({ length: int(0, 2) }, () => pick(eq).id), electrical: { treehouseScoped: chance(0.2) } } };
  if (type === 'cooktop') patch.inductionWiring = { labor: { id: orNull(pick(electricalLabor).id, 0.2) }, electrical: elec() };
  if (type === 'energy efficiency') patch.energyEfficiency = Object.fromEntries(['audit', 'airSealing', 'atticInsulation', 'atticAirSealing', 'blowerTest', 'crawlspace', 'aeroseal', 'vaporGuard'].map((k) => [k, { enabled: chance(0.5), squareFeet: int(100, 1500), ahuCount: int(0, 3) }]));
  if (type === 'adder') patch.otherData = { item: { name: 'x', type: 'x', laborId: orNull(pick(lab).id, 0.2), equipmentId: orNull(pick(eq).id, 0.7) } };
  if (type === 'labor warranty') patch.laborWarranty = { warranty: { hp_term: pick([2, 5, 10, 12, 7]) } };
  const warranty = type === 'labor warranty' ? [{ proposal_id: 9919, fuel_type: pick(['heat pump', 'gas']), condenser_manufacturer: pick(['Mitsubishi', 'Bosch']), condenser_count: int(1, 3), ahu_count: int(0, 3), minisplit_count: int(0, 6) }] : [];
  return { input: makeSystemInput(patch), warranty };
}

async function runOriginalSpec(input: SystemInput, warranty: any[]) {
  const eq = sampleRefData.equipment, lab = sampleRefData.labor;
  const equipmentData = byId(eq);
  const t: any = clone(input);
  t.laborData = clone(lab);
  const startTrigger = { data: t };
  const specEquipmentFn = async (equipmentData1: any, laborData1: any, lineItems1: any, bb2d: any, bb1d: any, bb2l: any, bb1l: any, manual: boolean) =>
    ({ data: await new AsyncFunction('equipmentData1', 'laborData1', 'lineItems1', 'CircuitDifficultBB21', 'CircuitDifficultBB11', 'CircuitLengthBB21', 'CircuitLengthBB11', 'isManualOverride', 'console', SPEC_EQ)(equipmentData1, laborData1, lineItems1, bb2d, bb1d, bb2l, bb1l, manual, silent) });
  return new AsyncFunction('startTrigger', 'getEquipmentData', 'getJurisdictionRules', 'warrantyCounts', 'specEquipment', 'getHvacSystemType', 'ahri', 'console', SPEC_SYS)(
    startTrigger, { data: clone(eq) }, { data: clone(sampleRefData.jurisdictionRules.filter((j: any) => j.is_active !== false)) }, { data: clone(warranty) }, specEquipmentFn, originalHvacType, ahriSql(sampleRefData.ahri as any[]), silent);
}

const lineKey = (l: any) => JSON.stringify({ e: l.equipment_id ?? null, l: l.labor_id ?? null, d: l.description ?? null, t: l.line_item_type ?? null, q: num(l.quantity ?? null), p: l.equipment_provider ?? null, a: l.additional_data ?? null, m: l.maintenance_plan_id ?? null, pr: num(l.price_actual ?? null) });

describe('specSystemDetails (with specEquipment): original Retool code vs the port', () => {
  const N = 1000;
  it(`${N} random systems of every type give the same line items, system record and AHRI match`, async () => {
    const bad: string[] = [];
    const cover: Record<string, number> = {};
    const hit = (k: string) => { cover[k] = (cover[k] ?? 0) + 1; };
    for (let seed = 1; seed <= N; seed++) {
      const { input, warranty } = randomInput(seed);
      let orig: any, origErr: string | null = null;
      try { orig = await runOriginalSpec(input, warranty); } catch (e: any) { origErr = String(e?.message ?? e); }
      const ts = specSystemDetails(clone(input), { equipment: sampleRefData.equipment, labor: sampleRefData.labor, jurisdictionRules: sampleRefData.jurisdictionRules, ahri: sampleRefData.ahri } as any, { warrantyCounts: warranty });
      const type = (input as any).cost_system_type;
      hit('scenarios'); hit('type ' + type);
      if (origErr) {
        hit('original threw');
        if (ts.ok) bad.push(`seed ${seed} (${type}): original threw "${origErr.slice(0, 100)}" but the port returned ok`);
        else if (/Cannot read properties of undefined/.test(origErr) && /no equipment row|not found|unknown/i.test(ts.errors[0].message)) hit('unknown catalog id: both fail, the port names the id');
        else if (/Cannot read properties of undefined/.test(origErr)) hit('original crashes on a missing value (TypeError); the port fails with a clear message');
        else if (ts.errors[0].message.replace(/^Error: /, '') !== origErr.replace(/^Error: /, '')) bad.push(`seed ${seed} (${type}): error text differs\n   orig ${origErr.slice(0, 200)}\n   port ${ts.errors[0].message.slice(0, 200)}`);
        continue;
      }
      if (!ts.ok) { bad.push(`seed ${seed} (${type}): port failed "${ts.errors[0]?.message.slice(0, 160)}" but the original returned`); continue; }
      if (orig.ahriRecord?.id) hit('AHRI record found');
      const a = (orig.lineItems as any[]).map(lineKey), b = ts.lineItems.map(lineKey);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        const i = a.findIndex((x, k) => x !== b[k]);
        bad.push(`seed ${seed} (${type}): line items differ at #${i} (orig ${a.length} / port ${b.length})\n   orig ${a[i] ?? 'none'}\n   port ${b[i] ?? 'none'}`); continue;
      }
      const ns = (s: any) => JSON.stringify({ ...s, ahri_id: undefined, additional_data: s.additional_data });
      if (ns(orig.newSystem) !== ns(ts.newSystem)) { bad.push(`seed ${seed} (${type}): system record differs\n   orig ${ns(orig.newSystem).slice(0, 300)}\n   port ${ns(ts.newSystem).slice(0, 300)}`); continue; }
      const oid = orig.newSystem.ahri_id ?? null, pid = (ts.newSystem as any).ahri_id ?? null;
      if (oid !== pid) {
        const orow = sampleRefData.ahri.find((x: any) => x.id === oid), prow = sampleRefData.ahri.find((x: any) => x.id === pid);
        if ((orow as any)?.specificity_rank_opt !== (prow as any)?.specificity_rank_opt) bad.push(`seed ${seed} (${type}): AHRI differs orig ${oid} port ${pid}`); else hit('AHRI tie (either row is valid)');
      }
      const ea = (orig.errors as any[]).map((e) => e.message).sort(), eb = ts.errors.map((e) => e.message).sort();
      if (JSON.stringify(ea) !== JSON.stringify(eb)) bad.push(`seed ${seed} (${type}): errors differ orig ${JSON.stringify(ea).slice(0, 200)} port ${JSON.stringify(eb).slice(0, 200)}`);
    }
    console.log('specSystemDetails coverage:', JSON.stringify(cover));
    if (bad.length) console.log(`${bad.length} differ:\n` + bad.slice(0, 10).join('\n'));
    expect(bad.length).toBe(0);
  }, 300_000);
});
