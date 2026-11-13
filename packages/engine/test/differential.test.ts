/* Differential test: Retool's ORIGINAL specIncentives workflow code (legacy/workflows/specIncentives/*.js, run unmodified with the workflow's globals
   mocked) against our TypeScript port, on randomized scenarios. Every margin, incentive, limit, tax credit, finance-fee and EnergySmart-cap result
   must match. A mismatch is either a porting bug or a behavior to document. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sampleRefData, specIncentives, type IncentiveRow, type LineItem, type SpecIncentivesContext, type SpecIncentivesInput, type System } from '../src';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<any>;
const file = (name: string) => readFileSync(new URL(`../../../legacy/workflows/specIncentives/${name}`, import.meta.url), 'utf8');
const CODE = { transform: file('transformData.js'), limits: file('getInitializedLimits.js'), margin: file('calculateMargin.js'), spec: file('specIncentives.js') };
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/* ---------- seeded randomness ---------- */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Scenario {
  input: SpecIncentivesInput;
  ctx: SpecIncentivesContext;
  incentives: IncentiveRow[];
  houseSystems: any[];
  permitRows: any[];
  forLimits: any[];
  equipmentById: Record<number, any>;
  laborById: Record<number, any>;
}

const MULTIPLIERS = ['full install', 'electrical', 'non-electrical', 'furnace cost', 'cooling tonnage rounded 2', 'cooling tonnage rounded down', 'heating tonnage rounded 2',
  'heating47 tonnage rounded 1', 'heating tonnage rounded down', 'cooling tonnage rounded half ton', ''];

function build(seed: number): Scenario {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const money = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 100) / 100;

  const systemType = pick(['hvac', 'hvac', 'water heater']);
  const target = pick([0.15, 0.2, 0.22, 0.25, 0.3, 0.35]);
  const effective = pick(['2026-03-01', '2026-10-15', '2025-06-01']);
  const system = {
    id: 5001, house_id: 140, ahri_id: 1, proposal_id: 9919, system_type: systemType, system_status: 'proposed', system_type_detail: { fuel: 'heat pump' },
    target_margin: target, rebate_eligibility_type: pick(['none', 'whole', 'partial']), rebate_effective_date: chance(0.3) ? effective : null, heating_load_coverage: pick([null, '<50%', '80%+']),
  } as unknown as System;

  const electrical = sampleRefData.labor.filter((l) => l.category === 'electrical');
  const other = sampleRefData.labor.filter((l) => l.category !== 'electrical');
  const condensers = sampleRefData.equipment.filter((e) => e.equipment_type === 'Condenser');
  const mkLine = (over: Partial<LineItem>): LineItem => ({ id: 800000 + int(1, 99999), system_id: 5001, quantity: 1, state: 'persisted', status: null, ...over } as LineItem);

  const lines: LineItem[] = [];
  const nBase = int(2, 6);
  const usedIds = new Set<number>();
  const uid = () => { let i = 800001 + int(0, 9000); while (usedIds.has(i)) i++; usedIds.add(i); return i; };
  for (let i = 0; i < nBase; i++) {
    const kind = pick(['equipment', 'labor', 'labor', 'elabor']);
    const base: Partial<LineItem> = { id: uid(), price_actual: money(50, 7000) };
    if (kind === 'equipment') { const e = pick(condensers); lines.push(mkLine({ ...base, line_item_type: 'equipment', equipment_id: e.id, description: chance(0.2) ? 'Furnace ' + e.model_number : String(e.model_number) })); }
    else if (kind === 'elabor') { const l = pick(electrical); lines.push(mkLine({ ...base, line_item_type: 'labor', labor_id: l.id, description: l.name })); }
    else { const l = pick(other); lines.push(mkLine({ ...base, line_item_type: 'labor', labor_id: l.id, description: chance(0.15) ? 'Replace furnace' : l.name })); }
  }
  if (chance(0.4)) lines.push(mkLine({ id: uid(), line_item_type: 'discount', price_actual: -money(50, 900), description: 'Promo' }));
  if (chance(0.3)) lines.push(mkLine({ id: uid(), line_item_type: 'permit', price_actual: money(100, 500), description: 'Permit', permit_id: 1 }));
  // per-line margin settings
  for (const l of lines) {
    if (l.line_item_type === 'discount' || l.line_item_type === 'permit') continue;
    if (chance(0.15)) (l as any).margin_to_include = false;
    if (chance(0.15)) (l as any).margin_percent = pick([0.1, 0.2, 0.3]);
    if (chance(0.1)) (l as any).status = pick(['proposed - from change order', 'pending deletion']);
    (l as any).margin_amount = money(0, 900);
  }
  if (chance(0.5)) lines.push(mkLine({ id: uid(), line_item_type: 'margin', price_actual: money(100, 2000), description: 'Elephant Margin' }));

  // incentives
  const nInc = int(3, 8);
  const incentives: IncentiveRow[] = [];
  for (let i = 0; i < nInc; i++) {
    const id = 100 + i * 7 + int(0, 5);
    const tax = chance(0.2);
    const name = pick(['EnergySmart ', 'Xcel ', 'Mass Save ', 'Federal ', 'City ']) + 'Rebate ' + id;
    const mkOption = (): any => {
      const criteria: any = {};
      if (chance(0.5)) criteria.equipment = pick([{ equipment_type: 'Condenser' }, { equipment_type: 'Condenser', manufacturer: 'Mitsubishi' }, { is_energystar: true }]);
      if (chance(0.3)) criteria.labor = { category: pick(['electrical', 'hvac']) };
      if (chance(0.4)) criteria.house = pick([{ state: 'CO' }, { state: ['CO', 'MA'] }, { year_built: '<=1990' }, { year_built: '>=2000' }, { units: '>=1' }]);
      if (chance(0.4)) criteria.customer = pick([{ annual_gross_income: '>=60000' }, { annual_gross_income: '<=90000' }, { annual_gross_income: '<120000' }]);
      if (chance(0.3)) criteria.existing_system = pick([{ fuel: ['gas', 'oil'] }, { fuel: 'electric' }, { heating: { fuel: 'gas' } }, { cooling: { type: 'Central AC' } }]);
      if (chance(0.25)) criteria.ahri = pick([{ is_energystar: true }, { cooling_95: '>=20000' }]);
      if (chance(0.15)) criteria.system = pick([{ rebate_eligibility_type: 'whole' }, { heating_load_coverage: '80%+' }]);
      const multiplier_type = tax ? 'tax-federal' : pick(MULTIPLIERS);
      const amount: any = { multiplier_type, multiplier_value: pick([0.05, 0.1, 0.2, 0.3, 250, 400, 1000]), rounding_place: pick([0.01, 1, 10, 100]) };
      if (chance(0.7)) amount.max_amount = pick([0, 500, 1000, 2500, 8000, 14000]);
      if (chance(0.1)) criteria.amount = { max_amount: 0 };
      return { criteria: chance(0.1) ? {} : criteria, amount };
    };
    const options: any = {};
    for (let o = 1; o <= int(1, 3); o++) options['option_' + o] = mkOption();
    incentives.push({
      id, name, program: 'P', system_type: chance(0.85) ? systemType : (systemType === 'hvac' ? 'water heater' : 'hvac'), incentive_type: tax ? 'tax credit' : 'rebate',
      recipient: pick(['elephant', 'customer', 'homeowner']), affects_tax_credit: chance(0.3), finance_fee: chance(0.15) ? pick([100, 350]) : null,
      active_date: chance(0.2) ? '2026-06-01' : '2025-01-01', inactive_date: chance(0.2) ? '2026-04-01' : chance(0.5) ? '2030-12-31' : null,
      incentive_criteria: options,
    } as unknown as IncentiveRow);
  }
  // some incentives are named EnergySmart to exercise the 50% cap
  // existing incentive lines (adjusted, matching, finance charge)
  for (const inc of incentives) {
    if (chance(0.25)) lines.push(mkLine({ id: uid(), line_item_type: 'incentive', incentive_id: inc.id, description: String(inc.name), price_actual: -money(100, 3000), ...(chance(0.4) ? { adjustment_reason: 'Customer not eligible' } : {}) } as any));
    if ((inc as any).finance_fee && chance(0.5)) lines.push(mkLine({ id: uid(), line_item_type: 'incentive', incentive_id: inc.id, description: 'Finance Charge for ' + inc.name, price_actual: (inc as any).finance_fee, ...(chance(0.3) ? { adjustment_reason: 'Other' } : {}) } as any));
  }

  // limits
  const limits: any[] = [];
  for (let i = 0; i < int(0, 3); i++) {
    const ids = incentives.filter(() => chance(0.5)).map((x) => x.id);
    const form = pick(['array', 'json', 'csv']);
    limits.push({
      id: 900 + i, name: 'Limit ' + i, description: 'Limit description ' + i, timeframe: 'lifetime',
      limit_amount: chance(0.6) ? pick([500, 1500, 5000, 10000]) : null, limit_number: chance(0.5) ? pick([1, 2, 3]) : null,
      incentive_ids: form === 'array' ? ids : form === 'json' ? JSON.stringify(ids) : ids.join(','),
    });
  }
  const forLimits = incentives.filter(() => chance(0.25)).map((x) => ({ price_actual: -money(100, 2500), incentive_id: x.id }));

  const houseSystems: any[] = [];
  if (chance(0.8)) houseSystems.push({ id: -1, house_id: 140, proposal_id: null, system_type: systemType, system_status: 'active', system_type_detail: { heating: { fuel: pick(['gas', 'oil', 'electric']), type: 'furnace', age: 20 }, cooling: { type: pick(['Central AC', 'None']), capacity: 3 }, fuel: pick(['gas', 'electric']) } });
  houseSystems.push({ id: 5002, house_id: 140, proposal_id: 9919, system_type: 'water heater', system_status: 'proposed' });
  if (chance(0.5)) houseSystems.push({ id: 5003, house_id: 140, proposal_id: 9919, system_type: 'hvac', system_status: 'proposed' });
  if (chance(0.3)) houseSystems.push({ id: 5004, house_id: 140, proposal_id: 9919, system_type: 'cooktop', system_status: 'proposed' });

  const permitRows = chance(0.8) ? [{ price_actual: money(50, 300), permit_type: 'electrical' }, { price_actual: money(50, 300), permit_type: 'hvac' }, { price_actual: money(50, 300), permit_type: 'plumbing' }] : [];
  const house = { id: 140, state: pick(['CO', 'MA', 'CA']), year_built: pick([1950, 1985, 1995, 2010]), units: pick([1, 2]), city: 'X', county: 'Y' };
  const customer = { id: 1, annual_gross_income: pick([40000, 65000, 95000, 130000]) };
  const equipmentById = Object.fromEntries(sampleRefData.equipment.map((e) => [e.id, e]));
  const laborById = Object.fromEntries(sampleRefData.labor.map((l) => [l.id, l]));
  const ahri = { id: 1, cooling_95: pick([18000, 22000, 36000, 42000]), heating_47: pick([20000, 25000, 44000]), heating_5: pick([12000, 18000, 30000]), is_energystar: chance(0.6) };

  const initialAdd = chance(0.25);
  const mode = initialAdd ? 'add system' : pick([null, null, 'edit system']);
  if (initialAdd || chance(0.2)) for (const l of lines) if (l.line_item_type !== 'incentive' && l.line_item_type !== 'margin' && chance(0.7)) (l as any).state = 'transient';

  const input: SpecIncentivesInput = {
    system, lineItems: lines, house: house as any, customer, ahriRecord: ahri as any, proposal_id: 9919, mode, existing_system_id: 5001,
    rebateEffectiveDate: effective, system_margin: pick(['add', 'exclude', 'add']), initialAdd, transientMargin: chance(0.4) ? pick([0.1, 0.25, '']) : '',
    incentivesLimitData: limits, isArbitrary: chance(0.1),
  };
  return {
    input, incentives, houseSystems, permitRows, forLimits, equipmentById, laborById,
    ctx: { now: '2026-10-15T00:00:00.000Z', houseSystems: houseSystems as any, permitLineItems: permitRows, incentivesForLimits: forLimits as any },
  };
}

/* ---------- run the original code ---------- */
async function runOriginal(s: Scenario) {
  const input = clone(s.input) as any;
  const startTrigger = {
    data: {
      system: input.system, lineItems: input.lineItems, house: input.house, customer: input.customer, ahriRecord: input.ahriRecord, rebateEffectiveDate: input.rebateEffectiveDate,
      system_margin: input.system_margin, initialAdd: input.initialAdd, transientMargin: input.transientMargin, isArbitrary: input.isArbitrary, incentivesLimitData: input.incentivesLimitData,
      mode: input.mode, equipmentData: clone(s.equipmentById), laborData: clone(s.laborById), IncentiveIds: '[]', LogAllIncentives: false,
    },
  };
  const getIncentives = { data: clone(s.incentives) };
  const getIncentiveForLimits = { data: clone(s.forLimits) };
  const getAhriRecord = { data: [input.ahriRecord] };
  const getEquipmentData = { data: [] as any[] };
  const getLaborData = { data: [] as any[] };
  const transformData = { data: await new AsyncFunction('startTrigger', 'getEquipmentData', 'getLaborData', 'getIncentives', 'getIncentiveForLimits', 'getAhriRecord', 'console', CODE.transform)(startTrigger, getEquipmentData, getLaborData, getIncentives, getIncentiveForLimits, getAhriRecord, silent) };
  const getInitializedLimits = { data: await new AsyncFunction('transformData', 'console', CODE.limits)(transformData, silent) };
  const calculateMargin = { data: await new AsyncFunction('startTrigger', 'console', CODE.margin)(startTrigger, silent) };
  const getSystems = { data: clone(s.houseSystems) };
  const permits = { data: clone(s.permitRows) };
  const out = await new AsyncFunction('startTrigger', 'transformData', 'getInitializedLimits', 'calculateMargin', 'getSystems', 'permits', 'checkForAhriId', 'console', CODE.spec)(
    startTrigger, transformData, getInitializedLimits, calculateMargin, getSystems, permits, { data: null }, silent);
  return out;
}

/* ---------- compare ---------- */
const FIELDS = ['id', 'line_item_type', 'description', 'price_actual', 'margin_amount', 'margin_percent', 'incentive_id', 'incentive_recipient', 'margin_to_include', 'equipment_id', 'labor_id', 'adjustment_reason', 'temp_id', 'state'];
const norm = (v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v === undefined ? null : v);
const lineKey = (l: any) => FIELDS.reduce((o: any, f) => { const x = norm(l[f]); if (x !== null) o[f] = x; return o; }, {});

describe('specIncentives: original Retool code vs the TypeScript port', () => {
  const N = 1500;
  const mismatches: string[] = [];
  const cover: Record<string, number> = {};
  const hit = (k: string) => { cover[k] = (cover[k] ?? 0) + 1; };
  it(`${N} random scenarios produce the same lines, errors and deletions`, async () => {
    for (let seed = 1; seed <= N; seed++) {
      const sc = build(seed);
      const refData = { ...sampleRefData, incentives: sc.incentives, incentiveLimits: sc.input.incentivesLimitData as any };
      let orig: any, origErr: string | null = null;
      try { orig = await runOriginal(sc); } catch (e: any) { origErr = String(e?.message ?? e); }
      const ts = specIncentives(clone(sc.input), refData, sc.ctx);
      if (origErr) { if (ts.ok) mismatches.push(`seed ${seed}: original threw "${origErr.slice(0, 120)}" but the port returned ok`); continue; }
      if (!ts.ok) { mismatches.push(`seed ${seed}: port failed (${ts.errors[0]?.message}) but the original returned`); continue; }
      // how much of the logic this scenario exercised (so a green run means something)
      const inc = (orig.result as any[]).filter((l) => l.line_item_type === 'incentive');
      hit('scenarios'); if (inc.some((l) => l.price_actual < 0)) hit('with a granted incentive'); if (inc.some((l) => String(l.description).startsWith('Finance Charge'))) hit('with a finance charge line');
      if (inc.some((l) => l.adjustment_reason)) hit('with an adjusted incentive preserved'); if ((orig.deletedIncentives as any[]).length) hit('with old incentive lines replaced');
      for (const e of orig.errors as any[]) { const m = String(e.message); if (/Quantity limit/.test(m)) hit('quantity limit reached'); else if (/Amount limit/.test(m)) hit('amount limit reduced'); else if (/EnergySmart rebates reduced/.test(m)) hit('EnergySmart scaled to 50% cap'); else if (/All EnergySmart/.test(m)) hit('EnergySmart eliminated by cap'); else if (/tax credit/i.test(m)) hit('tax credit limit message'); }
      if ((orig.result as any[]).some((l) => l.line_item_type === 'margin')) hit('margin line produced');
      if (sc.input.initialAdd) hit('add-system mode'); else hit('recalculate mode');
      if (sc.incentives.some((i: any) => i.incentive_type === 'tax credit') && inc.some((l) => /Federal/.test(String(l.description)))) hit('tax credit granted');
      const a = orig.result.map(lineKey), b = ts.result.map(lineKey);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        const i = a.findIndex((x: any, k: number) => JSON.stringify(x) !== JSON.stringify(b[k]));
        mismatches.push(`seed ${seed}: lines differ at #${i} (orig ${a.length} / port ${b.length} lines)\n   orig: ${JSON.stringify(a[i] ?? null)}\n   port: ${JSON.stringify(b[i] ?? null)}`);
        continue;
      }
      const ea = (orig.errors as any[]).map((e) => e.message).sort(), eb = ts.errors.map((e) => e.message).sort();
      if (JSON.stringify(ea) !== JSON.stringify(eb)) mismatches.push(`seed ${seed}: errors differ\n   orig: ${JSON.stringify(ea).slice(0, 300)}\n   port: ${JSON.stringify(eb).slice(0, 300)}`);
      const da = (orig.deletedIncentives as any[]).map((l) => l.id).sort(), db = ts.deletedIncentives.map((l) => l.id).sort();
      if (JSON.stringify(da) !== JSON.stringify(db)) mismatches.push(`seed ${seed}: deleted incentives differ ${JSON.stringify(da)} vs ${JSON.stringify(db)}`);
    }
    console.log('coverage:', JSON.stringify(cover));
    if (mismatches.length) console.log(`\n${mismatches.length} of ${N} scenarios differ:\n` + mismatches.slice(0, 12).join('\n'));
    expect(mismatches.length).toBe(0);
  }, 120_000);

  it('canary: the comparison does detect a difference', async () => {
    const sc = build(7);
    const refData = { ...sampleRefData, incentives: sc.incentives, incentiveLimits: sc.input.incentivesLimitData as any };
    const orig = await runOriginal(sc);
    const changed = clone(sc.input); (changed.lineItems.find((l: any) => l.price_actual > 0) as any).price_actual += 100;
    const ts = specIncentives(changed, refData, sc.ctx);
    if (!ts.ok) throw new Error('unexpected');
    expect(JSON.stringify(orig.result.map(lineKey))).not.toBe(JSON.stringify(ts.result.map(lineKey)));
  });
});
