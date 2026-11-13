import { describe, expect, it } from 'vitest';
import {
  calculateFinancingFees,
  calculateMargin,
  checkCriteria,
  checkCriterion,
  createIncentivesProvider,
  effectiveMargin,
  initializeLimits,
  marginLine,
  recalculateSystem,
  sampleCustomer,
  sampleHouses,
  sampleIncentiveInputs,
  sampleRefData,
  sampleSystemInputs,
  selectIncentivesForLimits,
  specAndPriceSystem,
  specIncentives,
  sumMargin,
  type IncentiveLimit,
  type IncentiveRow,
  type LineItem,
  type RefData,
  type SpecIncentivesContext,
  type SpecIncentivesInput,
  type SpecIncentivesOk,
  type System,
} from '../src';
import payload from '../../../legacy/workflows/specIncentives/_exampleInput.json';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const NOW = '2026-10-15T00:00:00.000Z';
const rd = (incentives: IncentiveRow[], incentiveLimits: IncentiveLimit[] = []): RefData => ({ ...sampleRefData, incentives, incentiveLimits });

let seq = 0;
function inc(partial: Partial<IncentiveRow> & { amount?: IncentiveRow['incentive_criteria'] extends infer _ ? any : never; criteria?: any }): IncentiveRow {
  const { amount, criteria, ...rest } = partial;
  const id = rest.id ?? 9000 + ++seq;
  return {
    id,
    name: `Test incentive ${id}`,
    incentive_type: 'rebate',
    recipient: 'homeowner',
    active_date: null,
    inactive_date: null,
    system_type: 'hvac',
    finance_fee: null,
    affects_tax_credit: false,
    incentive_criteria: { option_1: { criteria, amount: amount ?? { multiplier_type: 'full install', multiplier_value: 0.1, rounding_place: 1 } } } as any,
    ...rest,
  };
}
const amt = (multiplier_type: string, multiplier_value: number, extra: Record<string, unknown> = {}) => ({ multiplier_type, multiplier_value, rounding_place: 1, ...extra });

const sys = (patch: Partial<System> = {}): System => ({ id: 1, house_id: 140, proposal_id: 1, system_type: 'hvac', system_status: 'proposed', target_margin: 0.2, ahri_id: null, ...patch }) as System;

/**
 * Hand-checkable job at 20% margin (margin = 0.25 * price):
 *   equipment 380 (Condenser) 1000 -> 250 | labor 50 (electrical) 400 -> 100 | labor 19 (hvac) 600 -> 150 | 'Gas Furnace' 500 -> 125
 *   margin line = 625; fullInstallCost = 3125; electrical = 500 (+ permit share); non-electrical = 1250 + 750 + 625 (+ permit); furnace = 625
 */
function jobLines(): LineItem[] {
  return [
    { id: 1, system_id: 1, line_item_type: 'equipment', equipment_id: 380, description: 'Condenser unit', price_actual: 1000, state: 'persisted' },
    { id: 2, system_id: 1, line_item_type: 'labor', labor_id: 50, description: '20A circuit', price_actual: 400, state: 'persisted' },
    { id: 3, system_id: 1, line_item_type: 'labor', labor_id: 19, description: 'Install', price_actual: 600, state: 'persisted' },
    { id: 4, system_id: 1, line_item_type: 'equipment', description: 'Gas Furnace 80k', price_actual: 500, state: 'persisted' },
  ];
}
const AHRI = { id: 1, fuzzy_parent_id_opt: null, fuzzy_child_id_opt: null, fuzzy_furnace_id_opt: null, specificity_rank_opt: 1, cooling_95: 31000, heating_47: 26000, heating_5: 19000 };

function run(incentives: IncentiveRow[], over: Partial<SpecIncentivesInput> = {}, ctxOver: Partial<SpecIncentivesContext> = {}, limits: IncentiveLimit[] = []): SpecIncentivesOk {
  const r = specIncentives(
    { system: sys(), lineItems: jobLines(), house: sampleHouses.co, customer: sampleCustomer(), ahriRecord: AHRI as any, proposal_id: 1, mode: null, existing_system_id: 1, system_margin: 'add', initialAdd: false, ...over },
    rd(incentives, limits),
    { now: NOW, houseSystems: [], permitLineItems: [], incentivesForLimits: [], ...ctxOver },
  );
  if (!r.ok) throw new Error('specIncentives failed: ' + r.errors[0].message);
  return r;
}
const incLines = (r: SpecIncentivesOk) => r.result.filter((l) => l.line_item_type === 'incentive');
const byInc = (r: SpecIncentivesOk, id: number) => r.result.find((l) => l.incentive_id === id && l.line_item_type === 'incentive');

/* ------------------------------------------------------------------ */
/* calculateMargin / sumMargin                                         */
/* ------------------------------------------------------------------ */

describe('calculateMargin', () => {
  const sysArg = { target_margin: 0.2 };

  it('margin_amount = round(target*price/(1-target), 2); margin line is the sum; effective margin = target', () => {
    const out = calculateMargin({ lineItems: jobLines(), system: sysArg });
    expect(out.map((l) => l.margin_amount)).toEqual([250, 100, 150, 125, undefined]);
    const m = out.at(-1)!;
    expect(m).toEqual({ price_actual: 625, line_item_type: 'margin', description: 'Elephant Margin' });
    // customer price = base + margin; margin / that = 20 %
    expect(effectiveMargin(out)).toBeCloseTo(0.2, 6);
  });

  it('works with a string target (as stored in Postgres numeric) - payload line 142.97 @ 0.2200 -> 40.32', () => {
    const out = calculateMargin({ lineItems: [{ line_item_type: 'equipment', price_actual: 142.97, state: 'persisted' }], system: { target_margin: '0.2200' } });
    expect(out[0].margin_amount).toBe(40.32);
  });

  it('keeps the id of the old margin line, removes old margin lines, does not mutate the input', () => {
    const lines: LineItem[] = [...jobLines(), { id: 99, line_item_type: 'margin', price_actual: 1, description: 'Elephant Margin' }];
    const frozen = JSON.stringify(lines);
    const out = calculateMargin({ lineItems: lines, system: sysArg });
    expect(JSON.stringify(lines)).toBe(frozen);
    expect(out.filter((l) => l.line_item_type === 'margin')).toHaveLength(1);
    expect(out.at(-1)!.id).toBe(99);
  });

  it('passthrough types (incentive, change order, margin, permit, discount) get price 0 -> margin 0', () => {
    const lines: LineItem[] = ['incentive', 'change order', 'permit', 'discount'].map((t) => ({ line_item_type: t, price_actual: -1000, state: 'persisted' }));
    const out = calculateMargin({ lineItems: lines, system: sysArg });
    expect(out.slice(0, 4).map((l) => l.margin_amount)).toEqual([0, 0, 0, 0]);
    expect(out.at(-1)!.price_actual).toBe(0);
  });

  it('excluded statuses are not summed into the margin line (but the line keeps its margin_amount)', () => {
    const lines: LineItem[] = jobLines().map((l, i) => (i === 0 ? { ...l, status: 'pending deletion' } : i === 1 ? { ...l, status: 'proposed - from change order' } : i === 2 ? { ...l, status: 'deleted - from change order' } : l));
    const out = calculateMargin({ lineItems: lines, system: sysArg });
    expect(out[0].margin_amount).toBe(250);
    expect(out.at(-1)!.price_actual).toBe(125);
  });

  it('initialAdd: system target for every line, margin_to_include = true, ignoring margin_percent / state', () => {
    const lines: LineItem[] = [{ line_item_type: 'equipment', price_actual: 1000, margin_percent: 0.5, margin_to_include: false }];
    const out = calculateMargin({ lineItems: lines, system: sysArg, initialAdd: true });
    expect(out[0]).toMatchObject({ margin_amount: 250, margin_to_include: true });
  });

  it('persisted lines: own margin_percent, else system target; margin_to_include === false -> 0; null/undefined -> included', () => {
    const lines: LineItem[] = [
      { line_item_type: 'equipment', price_actual: 1000, state: 'persisted', margin_percent: 0.5 },
      { line_item_type: 'equipment', price_actual: 1000, state: 'persisted', margin_to_include: false },
      { line_item_type: 'equipment', price_actual: 1000, state: 'persisted', margin_to_include: null },
    ];
    const out = calculateMargin({ lineItems: lines, system: sysArg });
    expect(out.slice(0, 3).map((l) => l.margin_amount)).toEqual([1000, 0, 250]);
  });

  it('transient lines: add (transientMargin), exclude, same-as-system target; state becomes persisted', () => {
    const t = (): LineItem => ({ line_item_type: 'equipment', price_actual: 1000, state: 'transient' });
    const add = calculateMargin({ lineItems: [t()], system: sysArg, system_margin: 'add', transientMargin: 0.5 });
    expect(add[0]).toMatchObject({ margin_amount: 1000, margin_percent: 0.5, margin_to_include: true, state: 'persisted' });
    const same = calculateMargin({ lineItems: [t()], system: sysArg, system_margin: 'add', transientMargin: '' });
    expect(same[0]).toMatchObject({ margin_amount: 250, margin_percent: null });
    const excl = calculateMargin({ lineItems: [t()], system: sysArg, system_margin: 'exclude' });
    expect(excl[0]).toMatchObject({ margin_amount: 0, margin_to_include: false, state: 'persisted' });
    expect(excl.at(-1)!.price_actual).toBe(0);
  });

  it('a line with no state keeps its stored margin_amount (original quirk)', () => {
    const out = calculateMargin({ lineItems: [{ line_item_type: 'equipment', price_actual: 1000, margin_amount: 7 }], system: sysArg });
    expect(out[0].margin_amount).toBe(7);
    expect(out.at(-1)!.price_actual).toBe(7);
  });

  it('throws like the original when lineItems / system are missing', () => {
    expect(() => calculateMargin({ lineItems: undefined as any, system: sysArg })).toThrow(TypeError);
    expect(() => calculateMargin({ lineItems: [], system: undefined as any })).toThrow(TypeError);
  });
});

describe('sumMargin / marginLine (marginLogic.js)', () => {
  const lines: LineItem[] = [
    { line_item_type: 'equipment', margin_amount: 10.004 },
    { line_item_type: 'labor', margin_amount: '5.005' },
    { line_item_type: 'incentive', margin_amount: 99 }, // passthrough -> ignored
    { line_item_type: 'permit', margin_amount: 99 },
    { line_item_type: 'equipment', margin_amount: 50, status: 'pending deletion' }, // excluded
    { id: 7, line_item_type: 'margin', price_actual: 1, margin_amount: 99 },
    { line_item_type: 'equipment', margin_amount: null },
  ];
  it('sums non-passthrough, non-excluded margin_amount, rounded to cents', () => {
    expect(sumMargin(lines)).toBe(15.01);
    expect(sumMargin([])).toBe(0);
  });
  it('marginLine builds the Elephant Margin line and keeps the old id', () => {
    expect(marginLine(lines)).toEqual({ id: 7, price_actual: 15.01, line_item_type: 'margin', description: 'Elephant Margin' });
    expect(marginLine([{ line_item_type: 'labor', margin_amount: 1 }])).toEqual({ price_actual: 1, line_item_type: 'margin', description: 'Elephant Margin' });
  });
});

/* ------------------------------------------------------------------ */
/* criteria                                                            */
/* ------------------------------------------------------------------ */

describe('criteria operators', () => {
  it('numeric operators', () => {
    expect(checkCriterion('>=5', 5)).toBe(true);
    expect(checkCriterion('>=5', '4.9')).toBe(false);
    expect(checkCriterion('>5', 5)).toBe(false);
    expect(checkCriterion('<=0.5', 0.5)).toBe(true);
    expect(checkCriterion('<2', 3)).toBe(false);
    expect(checkCriterion('==3', '3')).toBe(true);
    expect(checkCriterion('=3', 4)).toBe(false);
    expect(checkCriterion('>= 5', 6)).toBe(true); // whitespace after the operator
  });
  it('operator text that is not a pure number is compared literally', () => {
    expect(checkCriterion('<50%', '<50%')).toBe(true);
    expect(checkCriterion('<50%', 40)).toBe(false);
    expect(checkCriterion('>=abc', '>=abc')).toBe(true);
  });
  it('literal text, trimmed; booleans / numbers use loose equality', () => {
    expect(checkCriterion('Xcel', ' Xcel ')).toBe(true);
    expect(checkCriterion('Xcel', 'xcel')).toBe(false);
    expect(checkCriterion(true, true)).toBe(true);
    expect(checkCriterion(true, 'true')).toBe(false);
    expect(checkCriterion(1, '1')).toBe(true);
    expect(checkCriterion(false, undefined)).toBe(false);
  });
  it('arrays are OR (also of operator strings); single-element data arrays are unwrapped', () => {
    expect(checkCriterion(['Boulder', 'Denver'], 'Denver')).toBe(true);
    expect(checkCriterion(['Boulder', 'Denver'], 'Aspen')).toBe(false);
    expect(checkCriterion(['<2', '>10'], 11)).toBe(true);
    expect(checkCriterion('oil', ['oil'])).toBe(true);
    expect(checkCriterion('oil', ['oil', 'gas'])).toBe(false);
  });
  it('invalid criterion values throw', () => {
    expect(() => checkCriterion(null, 1)).toThrow();
  });
  it('nested criteria recurse into nested data, dotted paths work, missing data is false; empty criteria -> null', () => {
    const data = { a: { b: { c: 5 } }, d: 'x', flag: true };
    expect(checkCriteria({ a: { b: { c: '>=5' } } }, data)).toBe(true);
    expect(checkCriteria({ 'a.b.c': 5, d: 'x' }, data)).toBe(true);
    expect(checkCriteria({ a: { b: { c: '>5' } } }, data)).toBe(false);
    expect(checkCriteria({ a: { z: 1 } }, data)).toBe(false);
    expect(checkCriteria({ d: { nested: 1 } }, data)).toBe(false); // data is not an object
    expect(checkCriteria({ missing: 'x' }, data)).toBe(false);
    expect(checkCriteria({ flag: true, d: 'y' }, data)).toBe(false); // ALL must hold
    expect(checkCriteria({}, data)).toBeNull();
    expect(checkCriteria({ x: 1 }, undefined)).toBe(false);
  });
});

describe('eligibility', () => {
  it('first fully matching option wins; criteria across keys are ANDed', () => {
    const i = inc({
      id: 1,
      incentive_criteria: {
        a: { criteria: { house: { state: 'MA' } }, amount: amt('full install', 1) },
        b: { criteria: { house: { state: 'CO' }, equipment: { equipment_type: 'Condenser' } }, amount: amt('full install', 0.1) },
        c: { amount: amt('full install', 0.01) },
      },
    });
    expect(byInc(run([i]), 1)!.price_actual).toBe(-313); // option b: 0.1 * 3125 = 312.5 -> 313
    const noEq = inc({ id: 2, incentive_criteria: { b: { criteria: { house: { state: 'CO' }, equipment: { equipment_type: 'Nope' } }, amount: amt('full install', 0.1) }, c: { amount: amt('full install', 0.01) } } });
    expect(byInc(run([noEq]), 2)!.price_actual).toBe(-31); // falls to option c (no criteria): 31.25 -> 31
  });
  it('no match -> no line', () => {
    expect(incLines(run([inc({ criteria: { house: { state: 'MA' } } })]))).toHaveLength(0);
  });
  it('criteria.amount.max_amount === 0 is an explicit not-eligible marker', () => {
    const i = inc({ id: 3, incentive_criteria: { a: { criteria: { house: { state: 'CO' }, amount: { max_amount: 0 } }, amount: amt('full install', 1) }, b: { criteria: { house: { state: 'MA' } }, amount: amt('full install', 1) } } });
    expect(incLines(run([i]))).toHaveLength(0);
  });
  it('wrong system_type is skipped', () => {
    expect(incLines(run([inc({ system_type: 'water heater' })]))).toHaveLength(0);
  });
  it('unknown criteria key pushes an error and is not met', () => {
    const r = run([inc({ criteria: { bogus: { a: 1 } } })]);
    expect(incLines(r)).toHaveLength(0);
    expect(r.errors.map((e) => e.message)).toContain('Invalid incentive criteria key: bogus');
  });
  it('equipment / labor criteria: ANY line item catalog row may match', () => {
    expect(incLines(run([inc({ criteria: { equipment: { manufacturer: 'Mitsubishi', equipment_type: 'Condenser' } } })]))).toHaveLength(1);
    expect(incLines(run([inc({ criteria: { labor: { category: 'electrical' } } })]))).toHaveLength(1);
    expect(incLines(run([inc({ criteria: { labor: { category: 'plumbing' } } })]))).toHaveLength(0);
  });
  it('house, customer, system and ahri criteria; isArbitrary bypasses house/customer', () => {
    const i = inc({ criteria: { house: { city: ['Broomfield', 'Denver'] }, customer: { annual_gross_income: '<=100000' }, system: { system_type: 'hvac' }, ahri: { cooling_95: '>=30000' } } });
    expect(incLines(run([i]))).toHaveLength(1);
    expect(incLines(run([i], { customer: sampleCustomer({ annual_gross_income: 200000 }) }))).toHaveLength(0);
    expect(incLines(run([i], { customer: sampleCustomer({ annual_gross_income: 200000 }), isArbitrary: true }))).toHaveLength(1);
    expect(incLines(run([inc({ criteria: { home: { state: 'CO' } } })]))).toHaveLength(1); // 'home' is an alias of 'house'
  });
  it('existing_system: default heating-nested detail, explicit cooling / heating, and both', () => {
    const existing = { id: 4000, house_id: 140, proposal_id: null, system_type: 'hvac', system_status: 'active', system_type_detail: { heating: { fuel: 'oil' }, cooling: { type: 'central ac' } } } as System;
    const ctx = { houseSystems: [existing] };
    expect(incLines(run([inc({ criteria: { existing_system: { fuel: 'oil' } } })], {}, ctx))).toHaveLength(1);
    expect(incLines(run([inc({ criteria: { existing_system: { fuel: 'gas' } } })], {}, ctx))).toHaveLength(0);
    // both nested: data = { cooling, heating }
    expect(incLines(run([inc({ criteria: { existing_system: { cooling: { type: 'central ac' }, heating: { fuel: 'oil' } } } })], {}, ctx))).toHaveLength(1);
    expect(incLines(run([inc({ criteria: { existing_system: { cooling: { type: 'central ac' }, heating: { fuel: 'gas' } } } })], {}, ctx))).toHaveLength(0);
    // LITERAL PORT QUIRK: with only cooling OR only heating nested, the data handed to the matcher is the sub-object itself, so the
    // nested key ('heating'/'cooling') is looked up inside it and is never found -> never eligible (probably a bug in Retool; see README)
    expect(incLines(run([inc({ criteria: { existing_system: { heating: { fuel: 'oil' } } } })], {}, ctx))).toHaveLength(0);
    expect(incLines(run([inc({ criteria: { existing_system: { cooling: { type: 'central ac' } } } })], {}, ctx))).toHaveLength(0);
    expect(incLines(run([inc({ criteria: { existing_system: { fuel: 'oil' } } })]))).toHaveLength(0); // no existing system
    // inactive / other-type systems are not "existing"
    const r = run([inc({ criteria: { existing_system: { fuel: 'oil' } } })], {}, { houseSystems: [{ ...existing, system_status: 'proposed' } as System] });
    expect(r.existingSystem).toBeNull();
  });
  it('cooktop systems get the synthetic gas cooktop as existing system', () => {
    const r = run([inc({ system_type: 'cooktop', criteria: { existing_system: { fuel: 'gas' } } })], { system: sys({ system_type: 'cooktop' }) });
    expect(r.existingSystem).toMatchObject({ system_type: 'cooktop', system_type_detail: { fuel: 'gas' } });
    expect(incLines(r)).toHaveLength(1);
  });
  it('date window: inclusive both ends, rebate_effective_date beats rebateEffectiveDate beats now', () => {
    const i = inc({ id: 5, active_date: '2026-10-01', inactive_date: '2026-10-15T00:00:00.000Z' });
    expect(incLines(run([i]))).toHaveLength(1); // now == inactive_date
    expect(incLines(run([i], { rebateEffectiveDate: '2026-09-30' }))).toHaveLength(0);
    expect(incLines(run([i], { rebateEffectiveDate: '2026-10-16' }))).toHaveLength(0);
    expect(incLines(run([i], { rebateEffectiveDate: '2026-10-16', system: sys({ rebate_effective_date: '2026-10-05' }) }))).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* amounts                                                             */
/* ------------------------------------------------------------------ */

describe('amount multipliers', () => {
  // cost bases of jobLines() with a 100 electrical + 50 hvac permit on the proposal (1 system) -> electrical 600, non-electrical 2675
  const permits = [{ price_actual: 100, permit_type: 'electrical' }, { price_actual: 50, permit_type: 'hvac' }];
  const cases: Array<[string, number, Record<string, unknown>, number]> = [
    ['full install', 0.1, {}, 313], // 3125 * 0.1 = 312.5 -> 313
    ['electrical', 0.5, {}, 300], // (400+100 margin + 100 permit share) * 0.5
    ['non-electrical', 0.1, { rounding_place: 0.01 }, 267.5], // (1250+750+625 + 50 hvac permit) * 0.1
    ['furnace cost', 1, {}, 625],
    ['cooling tonnage rounded 2', 100, {}, 258], // 31000/12000 = 2.5833 -> 2.58 * 100
    ['cooling tonnage rounded down', 100, {}, 200],
    ['cooling tonnage rounded half ton', 100, {}, 250], // 2.5833 -> 2.5
    ['heating tonnage rounded 2', 100, {}, 158], // heating_5 19000 -> 1.58
    ['heating47 tonnage rounded 1', 100, {}, 220], // 26000 -> 2.2
    ['heating tonnage rounded down', 100, {}, 200],
  ];
  it.each(cases)('%s', (type, value, extra, expected) => {
    const i = inc({ id: 11, amount: amt(type, value, extra) });
    const r = run([i], {}, { permitLineItems: permits });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(byInc(r, 11)!.price_actual).toBeCloseTo(-expected, 6);
  });

  it('electrical permit cost is shared by the number of hvac/water heater/cooktop/panel systems of the proposal', () => {
    const others = [sys({ id: 2 }), sys({ id: 3, system_type: 'water heater' }), sys({ id: 4, system_type: 'ev' })];
    const i = inc({ id: 12, amount: amt('electrical', 1) });
    // this system is not in houseSystems; 2 of the 3 count -> 100 / 2 = 50 -> 500 + 50
    expect(byInc(run([i], {}, { permitLineItems: permits, houseSystems: others }), 12)!.price_actual).toBe(-550);
  });

  it('rounding_place rounds to that power of 10 (default 0.01); max_amount caps; max-only incentives return the max', () => {
    expect(byInc(run([inc({ id: 13, amount: { multiplier_type: 'full install', multiplier_value: 0.1, rounding_place: 100 } })]), 13)!.price_actual).toBe(-300);
    expect(byInc(run([inc({ id: 14, amount: { multiplier_type: 'full install', multiplier_value: 0.1, rounding_place: 10 } })]), 14)!.price_actual).toBe(-310);
    expect(byInc(run([inc({ id: 15, amount: { multiplier_type: 'full install', multiplier_value: 0.5, rounding_place: 1, max_amount: 1000 } })]), 15)!.price_actual).toBe(-1000);
    expect(byInc(run([inc({ id: 16, amount: { multiplier_type: 'full install', multiplier_value: 0.01, max_amount: 5000 } })]), 16)!.price_actual).toBeCloseTo(-31.25, 6);
    expect(byInc(run([inc({ id: 17, amount: { multiplier_type: 'full install', multiplier_value: undefined, max_amount: 800 } as any })]), 17)).toBeUndefined(); // NaN multiplied -> NaN amount -> dropped (original behaviour)
  });

  it('invalid rounding_place / multiplier type / missing AHRI become warnings of the first pass, not errors', () => {
    const r = run(
      [
        inc({ id: 21, amount: { multiplier_type: 'full install', multiplier_value: 1, rounding_place: 3 } }),
        inc({ id: 22, amount: amt('bogus type', 1) }),
        inc({ id: 23, amount: amt('cooling tonnage rounded 2', 1) }),
        inc({ id: 24, amount: amt('tax-federal', 0.3) }), // only valid for tax credits
        inc({ id: 25, amount: amt('', 1) }), // '' -> 0 -> no line
      ],
      { ahriRecord: null },
    );
    expect(incLines(r)).toHaveLength(0);
    expect(r.errors).toEqual([]);
    const msgs = r.warnings.map((w) => w.message).join('\n');
    expect(msgs).toContain('rounding_place must be a power of 10');
    expect(msgs).toContain('Invalid multiplier type bogus type');
    expect(msgs).toContain('No AHRI record found');
    expect(msgs).toContain('tax-federal multiplier type is only valid for tax credits');
  });

  it('AHRI record is looked up by ahri_id in refData.ahri when not given', () => {
    const rec = sampleRefData.ahri[0];
    const r = run([inc({ id: 26, amount: amt('cooling tonnage rounded down', 100) })], { ahriRecord: '', ahri_id: rec.id });
    expect(byInc(r, 26)!.price_actual).toBe(-300); // sample ahri 36000 BTU = 3 tons
  });

  it('incentive lines are sorted by amount, descending; line shape', () => {
    const a = inc({ id: 31, amount: amt('full install', 0.1) }); // 313
    const b = inc({ id: 32, amount: amt('full install', 0.5) }); // 1563
    const c = inc({ id: 33, amount: amt('full install', 0.2), recipient: 'elephant' }); // 625
    const r = run([a, b, c]);
    expect(incLines(r).map((l) => l.incentive_id)).toEqual([32, 33, 31]);
    expect(byInc(r, 33)).toMatchObject({ price_actual: -625, incentive_recipient: 'elephant', description: c.name, line_item_type: 'incentive' });
  });

  it('result layout: non-incentive lines, margin line, incentive lines; temp_id 1..n; old incentive lines reported as deleted', () => {
    const old: LineItem = { id: 50, system_id: 1, line_item_type: 'incentive', incentive_id: 999, description: 'Gone', price_actual: -10, state: 'persisted' };
    const i = inc({ id: 34 });
    const r = run([i], { lineItems: [...jobLines(), old] });
    expect(r.result.map((l) => l.line_item_type)).toEqual(['equipment', 'labor', 'labor', 'equipment', 'margin', 'incentive']);
    expect(r.result.map((l) => l.temp_id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.deletedIncentives).toEqual([{ ...old, margin_amount: 0 }]); // the margin step ran on it first (as in Retool)
    expect(r.result.find((l) => l.line_item_type === 'margin')!.price_actual).toBe(625);
  });
});

/* ------------------------------------------------------------------ */
/* limits                                                              */
/* ------------------------------------------------------------------ */

describe('limits', () => {
  it('initializeLimits: counts received amounts/numbers (ids as array, JSON text or CSV), does not mutate', () => {
    const limits: IncentiveLimit[] = [
      { id: 1, name: 'a', limit_amount: 100, limit_number: null, timeframe: null, incentive_ids: [1, 2] },
      { id: 2, name: 'b', limit_amount: null, limit_number: 2, timeframe: null, incentive_ids: '[2,3]' },
      { id: 3, name: 'c', limit_amount: null, limit_number: 2, timeframe: null, incentive_ids: '3, 4' },
      { id: 4, name: 'd', limit_amount: null, limit_number: 2, timeframe: null, incentive_ids: 'garbage' as any },
    ];
    const frozen = JSON.stringify(limits);
    const out = initializeLimits([{ price_actual: -40, incentive_id: 1 }, { price_actual: '-60.5', incentive_id: 2 }, { price_actual: 10, incentive_id: 3 }], limits);
    expect(JSON.stringify(limits)).toBe(frozen);
    expect(out.map((l) => [l.id, l.received_amount, l.received_number, l.incentive_ids])).toEqual([
      [1, 100.5, 2, [1, 2]],
      [2, 70.5, 2, [2, 3]],
      [3, 10, 1, [3, 4]],
      [4, 0, 0, []],
    ]);
    expect(initializeLimits(null, limits)).toEqual([]);
  });

  it('selectIncentivesForLimits mirrors getIncentiveForLimits.sql', () => {
    const systems = [
      { id: 1, house_id: 9, proposal_id: 100, system_type: 'hvac', system_status: 'active' },
      { id: 2, house_id: 9, proposal_id: 200, system_type: 'hvac', system_status: 'proposed' },
      { id: 3, house_id: 9, proposal_id: 200, system_type: 'hvac', system_status: 'proposed' },
      { id: 4, house_id: 8, proposal_id: 100, system_type: 'hvac', system_status: 'active' },
    ] as System[];
    const li = (id: number, system_id: number, extra: Partial<LineItem> = {}): LineItem => ({ id, system_id, incentive_id: 5, price_actual: -100, ...extra });
    const lines = [li(1, 1), li(2, 2), li(3, 3), li(4, 4), li(5, 1, { price_actual: 0 }), li(6, 1, { status: 'pending deletion' }), li(7, 1, { incentive_id: null })];
    const q = (mode: string | null, existingSystemId: number | null) => selectIncentivesForLimits({ systems, lineItems: lines, houseId: 9, proposalId: 200, mode, existingSystemId }).length;
    expect(q('add system', null)).toBe(3); // active system 1 + both systems of the proposal
    expect(q('edit system', 2)).toBe(2); // active + system 3 (not 2)
    expect(q(null, 2)).toBe(2); // Recalculate: same as edit
    expect(q(null, null)).toBe(1); // SQL `s.id != NULL` is never true
  });

  const limit = (over: Partial<IncentiveLimit>): IncentiveLimit => ({ id: 1, name: 'L', limit_amount: null, limit_number: null, timeframe: 'lifetime', description: 'desc', incentive_ids: [41, 42], ...over });

  it('quantity limit: already reached -> amount 0, line dropped, error', () => {
    const r = run([inc({ id: 41 })], {}, { incentivesForLimits: [{ price_actual: -100, incentive_id: 41 }] }, [limit({ limit_number: 1 })]);
    expect(byInc(r, 41)).toBeUndefined();
    expect(r.errors.map((e) => e.message)).toEqual(['Quantity limit reached for incentive Test incentive 41: desc.']);
  });
  it('quantity limit: counts the incentives granted in this run, in descending-amount order', () => {
    const big = inc({ id: 41, amount: amt('full install', 0.5) });
    const small = inc({ id: 42, amount: amt('full install', 0.1) });
    const r = run([small, big], {}, {}, [limit({ limit_number: 1 })]);
    expect(byInc(r, 41)!.price_actual).toBe(-1563);
    expect(byInc(r, 42)).toBeUndefined();
    expect(r.limits[0]).toMatchObject({ received_number: 1 });
  });
  it('amount limit reduces to the remaining amount (and errors); then nothing is left', () => {
    const a = inc({ id: 41, amount: amt('full install', 0.2) }); // 625
    const b = inc({ id: 42, amount: amt('full install', 0.1) }); // 313
    const r = run([a, b], {}, { incentivesForLimits: [{ price_actual: -200, incentive_id: 41 }] }, [limit({ limit_amount: 700 })]);
    expect(byInc(r, 41)!.price_actual).toBe(-500); // 700 - 200 received
    expect(byInc(r, 42)).toBeUndefined(); // remaining 0 -> dropped
    expect(r.errors[0].message).toBe('Amount limit reached for incentive Test incentive 41: desc. Remaining amount: 500');
    expect(r.limits[0].received_amount).toBe(700);
  });
  it('quantity limits are applied before amount limits (a reached quantity limit zeroes the amount; the amount limit is not touched)', () => {
    const i = inc({ id: 41, amount: amt('full install', 0.2) });
    const amountLimit = limit({ id: 1, limit_amount: 100 });
    const qtyLimit = limit({ id: 2, limit_number: 1 });
    const r = run([i], {}, { incentivesForLimits: [{ price_actual: -5, incentive_id: 41 }] }, [amountLimit, qtyLimit]); // amount limit listed first
    expect(byInc(r, 41)).toBeUndefined();
    expect(r.errors.map((e) => e.message)).toEqual(['Quantity limit reached for incentive Test incentive 41: desc.']);
    const amountAfter = r.limits.find((l) => l.id === 1)!;
    expect(amountAfter.received_amount).toBe(5); // untouched by this run
  });
  it('limits only match their incentive_ids', () => {
    const r = run([inc({ id: 43 })], {}, { incentivesForLimits: [{ price_actual: -100, incentive_id: 41 }] }, [limit({ limit_number: 1 })]);
    expect(byInc(r, 43)).toBeDefined();
  });
  it('limits are derived from houseLineItems when incentivesForLimits is not given', () => {
    const houseSystems = [{ id: 77, house_id: 140, proposal_id: 5, system_type: 'hvac', system_status: 'active' } as System];
    const ctx = { incentivesForLimits: undefined, houseSystems, houseLineItems: [{ id: 1, system_id: 77, incentive_id: 41, price_actual: -100 }] };
    const r = run([inc({ id: 41 })], {}, ctx, [limit({ limit_number: 1 })]);
    expect(byInc(r, 41)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* tax credits, finance fees, adjusted lines, EnergySmart              */
/* ------------------------------------------------------------------ */

describe('tax credits (second pass)', () => {
  const credit = (over: Partial<IncentiveRow> = {}) => inc({ id: 61, incentive_type: 'tax credit', amount: amt('tax-federal', 0.3, { max_amount: 2000 }), ...over });

  it('tax-federal base = fullInstallCost + negative tax-affecting incentives', () => {
    const affecting = inc({ id: 62, amount: amt('full install', 0.2), affects_tax_credit: true }); // -625
    const other = inc({ id: 63, amount: amt('full install', 0.1) }); // -313, not affecting
    const r = run([credit(), affecting, other]);
    expect(byInc(r, 62)!.price_actual).toBe(-625);
    expect(byInc(r, 61)!.price_actual).toBeCloseTo(-750, 6); // 0.3 * (3125 - 625) = 750
    // the tax credit comes after all rebates in the result
    expect(incLines(r).map((l) => l.incentive_id).at(-1)).toBe(61);
  });
  it('max_amount caps the credit; limits apply to credits with the "tax credit" wording', () => {
    const big = credit({ amount: amt('tax-federal', 0.9, { max_amount: 2000 }) });
    expect(byInc(run([big]), 61)!.price_actual).toBe(-2000);
    const r = run([credit()], {}, { incentivesForLimits: [{ price_actual: -1, incentive_id: 61 }] }, [{ id: 1, name: 'x', limit_amount: null, limit_number: 1, timeframe: null, description: 'once', incentive_ids: [61] }]);
    expect(byInc(r, 61)).toBeUndefined();
    expect(r.errors[0].message).toBe('Quantity limit reached for tax credit Test incentive 61: once.');
  });
  it('errors of the tax pass ARE reported in errors (unlike the first pass)', () => {
    const r = run([credit({ incentive_criteria: null })]);
    expect(r.errors[0].message).toContain('Error processing tax credit incentive 61. Message:');
    expect(r.warnings).toEqual([]);
  });
  it('tax credits honour the date window and system type', () => {
    expect(byInc(run([credit({ inactive_date: '2026-01-01' })]), 61)).toBeUndefined();
    expect(byInc(run([credit({ system_type: 'water heater' })]), 61)).toBeUndefined();
  });
});

describe('finance fees and adjusted lines', () => {
  it('an incentive with finance_fee adds a positive Finance Charge line (id of the old one kept)', () => {
    const i = inc({ id: 71, finance_fee: 350 });
    const old: LineItem = { id: 900, system_id: 1, line_item_type: 'incentive', incentive_id: 71, description: `Finance Charge for ${i.name}`, price_actual: 300, state: 'persisted' };
    const r = run([i], { lineItems: [...jobLines(), old] });
    const fee = r.result.find((l) => String(l.description).startsWith('Finance Charge'))!;
    expect(fee).toMatchObject({ id: 900, price_actual: 350, incentive_id: 71, line_item_type: 'incentive', description: `Finance Charge for ${i.name}` });
    expect(incLines(r)).toHaveLength(2);
    expect(r.deletedIncentives).toHaveLength(1);
  });
  it('no fee when the incentive produced nothing', () => {
    const r = run([inc({ id: 72, finance_fee: 350, criteria: { house: { state: 'MA' } } })]);
    expect(incLines(r)).toHaveLength(0);
  });
  it('adjusted incentive / fee lines (adjustment_reason) are preserved verbatim; others keep only their id', () => {
    const i = inc({ id: 73, finance_fee: 100 });
    const adjusted: LineItem = { id: 801, system_id: 1, line_item_type: 'incentive', incentive_id: 73, description: i.name.toUpperCase(), price_actual: -42, adjustment_reason: 'manager approved', state: 'persisted' };
    const adjFee: LineItem = { id: 802, system_id: 1, line_item_type: 'incentive', incentive_id: 73, description: `Finance Charge for ${i.name}`, price_actual: 9, adjustment_reason: 'waived', state: 'persisted' };
    const r = run([i], { lineItems: [...jobLines(), adjusted, adjFee] });
    expect(byInc(r, 73)).toMatchObject({ id: 801, price_actual: -42, adjustment_reason: 'manager approved' });
    expect(r.result.find((l) => l.id === 802)).toMatchObject({ price_actual: 9, adjustment_reason: 'waived' });
    // not adjusted -> recalculated but id kept
    const plain: LineItem = { ...adjusted, adjustment_reason: null, price_actual: -1 };
    const r2 = run([inc({ id: 73 })], { lineItems: [...jobLines(), plain] });
    expect(byInc(r2, 73)).toMatchObject({ id: 801, price_actual: -313 });
    expect(r2.deletedIncentives.map((l) => l.id)).toEqual([801]);
  });
  it('input lines are not mutated by the cap / adjusted handling', () => {
    const adjusted: LineItem = { id: 801, system_id: 1, line_item_type: 'incentive', incentive_id: 19, description: 'EnergySmart X', price_actual: -500, adjustment_reason: 'x' };
    const lines = [...jobLines(), adjusted];
    const frozen = JSON.stringify(lines);
    run([inc({ id: 19, name: 'EnergySmart X', amount: amt('full install', 0.5) })], { lineItems: lines });
    expect(JSON.stringify(lines)).toBe(frozen);
  });
});

describe('EnergySmart 50% project cost cap', () => {
  // fullInstallCost 3125 -> cap 1562.5
  const es = (id: number, mult: number) => inc({ id, name: `EnergySmart Rebate ${id}`, amount: amt('full install', mult) });

  it('under the cap: untouched', () => {
    const r = run([es(81, 0.2), inc({ id: 82, amount: amt('full install', 0.1) })]); // 625 + 313
    expect(byInc(r, 81)!.price_actual).toBe(-625);
    expect(r.errors).toEqual([]);
  });
  it('branch 1: non-EnergySmart stack already >= 50% -> all EnergySmart lines zeroed, error', () => {
    const r = run([es(81, 0.2), inc({ id: 82, amount: amt('full install', 0.6) })]); // other = 1875 >= 1562.5
    expect(byInc(r, 81)!.price_actual).toBe(0);
    expect(byInc(r, 82)!.price_actual).toBe(-1875);
    expect(r.errors.map((e) => e.message)).toEqual(['All EnergySmart rebates eliminated: incentive stack already exceeds 50% of project cost ($1562.5) before EnergySmart rebates.']);
  });
  it('branch 2: EnergySmart scaled proportionally into the remaining room, error', () => {
    // other 500 (0.16) -> room 1062.5; ES 1250 (0.4) + 625 (0.2) = 1875 -> 1250/1875*1062.5 = 708.33 -> 708 ; 625/1875*1062.5 = 354.17 -> 354
    const r = run([es(81, 0.4), es(83, 0.2), inc({ id: 82, amount: amt('full install', 0.16) })]);
    expect(byInc(r, 82)!.price_actual).toBe(-500);
    expect(byInc(r, 81)!.price_actual).toBe(-708);
    expect(byInc(r, 83)!.price_actual).toBe(-354);
    expect(r.errors.map((e) => e.message)).toEqual(['EnergySmart rebates reduced from $1875 to $1062.5 to stay within 50% of project cost ($1562.5).']);
  });
  it('fixture: EnergySmart 19 + Xcel + HEAR on the CO sample job', () => {
    const { input, ctx } = sampleIncentiveInputs.energySmartCap;
    const r = specIncentives(input, sampleRefData, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // HEAR (0.5 * non-electrical) + Xcel already exceed 50 % -> branch 1: EnergySmart eliminated
    expect(byInc(r, 19)!.price_actual).toBe(0);
    expect(r.errors.some((e) => e.message.startsWith('All EnergySmart rebates eliminated'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

describe('sample incentive fixtures', () => {
  it('rows are JSON-serialisable with stable ids and cover the required scenarios', () => {
    expect(JSON.parse(JSON.stringify(sampleRefData.incentives))).toEqual(sampleRefData.incentives);
    const ids = sampleRefData.incentives.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([19, 20, 45, 101, 102, 103, 201, 243, 301, 401, 402]));
    expect(sampleRefData.incentives.find((i) => i.id === 243)!.name).toBe('LA Department of Water & Power Heat Pump Rebate');
    expect(sampleRefData.incentives.some((i) => i.incentive_type === 'tax credit')).toBe(true);
    expect(sampleRefData.incentives.some((i) => i.finance_fee)).toBe(true);
    expect(sampleRefData.incentiveLimits.length).toBeGreaterThanOrEqual(5);
  });

  it('CO sample: Xcel (400 * 2.5 tons = 1000), EnergySmart, HEAR and the 25C credit', () => {
    const { input, ctx } = sampleIncentiveInputs.coHeatPump;
    const r = specIncentives(input, sampleRefData, ctx);
    if (!r.ok) throw new Error(r.errors[0].message);
    expect(r.warnings).toEqual([]);
    expect(byInc(r, 201)!.price_actual).toBe(-1400); // 42000/12000 = 3.5 tons -> 400 * 3.5
    expect(byInc(r, 19)).toBeDefined();
    expect(byInc(r, 301)).toBeDefined();
    const credit = byInc(r, 401)!;
    expect(credit.price_actual).toBeLessThan(0);
    expect(Number(credit.price_actual)).toBeGreaterThanOrEqual(-2000);
  });

  it('MA sample with existing oil system: option_1 of Mass Save 101; finance fee for 103', () => {
    const { input, ctx } = sampleIncentiveInputs.maHeatPump;
    const r = specIncentives(input, sampleRefData, ctx);
    if (!r.ok) throw new Error(r.errors[0].message);
    expect(byInc(r, 101)!.price_actual).toBe(-4380); // 3.5 tons (42000/12000) -> 1250 * 3.5 = 4375 -> rounded to 10 = 4380 (4375/10=437.5 -> 438)
    expect(r.result.find((l) => l.description === 'Finance Charge for Mass Save HEAT Loan Interest Buydown')!.price_actual).toBe(350);
    // without the oil system the smaller fallback option applies: floor(3.5) = 3 tons * 500
    const noOil = specIncentives(input, sampleRefData, { ...ctx, houseSystems: [] });
    if (!noOil.ok) throw new Error('x');
    expect(byInc(noOil, 101)!.price_actual).toBe(-1500);
  });

  it('LA DWP sample reproduces the -4500 of the real payload and keeps the existing line id', () => {
    const { input, ctx } = sampleIncentiveInputs.laDwpHeatPump;
    const r = specIncentives(input, sampleRefData, ctx);
    if (!r.ok) throw new Error(r.errors[0].message);
    expect(byInc(r, 243)).toMatchObject({ id: 582628, price_actual: -4500, incentive_recipient: 'elephant' });
    expect(r.result.find((l) => l.line_item_type === 'discount')).toBeDefined(); // discount passes through untouched
    expect(r.existingSystem).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* the real payload                                                    */
/* ------------------------------------------------------------------ */

describe('legacy/workflows/specIncentives/_exampleInput.json', () => {
  const p = payload as any;
  const toInput = (over: Partial<SpecIncentivesInput> = {}): SpecIncentivesInput => ({
    system: p.system,
    lineItems: p.lineItems,
    house: p.house,
    customer: p.customer,
    ahriRecord: p.ahriRecord,
    ahri_id: p.ahri_id,
    proposal_id: p.proposal_id,
    mode: p.mode,
    existing_system_id: p.existing_system_id,
    rebateEffectiveDate: p.rebateEffectiveDate,
    system_margin: p.system_margin,
    initialAdd: p.initialAdd,
    transientMargin: p.transientMargin,
    incentivesLimitData: p.incentivesLimitData,
    ...over,
  });
  const ctx: SpecIncentivesContext = { now: NOW, houseSystems: [], permitLineItems: [], incentivesForLimits: [] };

  it('runs through specIncentives without throwing and keeps the invariants (sample catalog does not know the payload ids)', () => {
    const frozen = JSON.stringify(p);
    const r = specIncentives(toInput(), sampleRefData, ctx);
    expect(JSON.stringify(p)).toBe(frozen); // input untouched
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // one margin line, id kept, at the end of the non-incentive lines
    const margins = r.result.filter((l) => l.line_item_type === 'margin');
    expect(margins).toHaveLength(1);
    expect(margins[0].id).toBe(582646);
    // margin is the sum of per-line margins: the payload's stored margin line is 4147.56
    expect(Number(margins[0].price_actual)).toBeCloseTo(4147.56, 1);
    // every persisted base line got margin_amount = round(0.22*price/0.78, 2)
    const base = r.result.find((l) => l.id === 582631)!;
    expect(base.margin_amount).toBe(40.32);
    // temp ids 1..n, no duplicates of incentive ids, only incentives that exist in refData
    expect(r.result.map((l) => l.temp_id)).toEqual(r.result.map((_, i) => i + 1));
    const incIds = incLines(r).map((l) => l.incentive_id);
    expect(new Set(incIds).size).toBe(incIds.length);
    // the old incentive line is reported as deleted
    expect(r.deletedIncentives.map((l) => l.id)).toEqual([582628]);
    // ahriRecord '' + ahri_id 2965 not in the sample AHRI table -> the AHRI-based LA rebate cannot be computed (warning, not a crash)
    expect(r.warnings.some((w) => w.message.includes('No AHRI record found'))).toBe(true);
    // the discount line is untouched passthrough
    expect(r.result.find((l) => l.id === 582629)).toMatchObject({ line_item_type: 'discount', price_actual: -750 });
  });

  it('with the AHRI values of the system supplied, the LA rebate is -4500 and the stored incentive line id is reused', () => {
    const r = specIncentives(toInput({ ahriRecord: { id: 2965, cooling_95: p.system.cooling_95, heating_47: p.system.heating_47 } as any }), sampleRefData, ctx);
    if (!r.ok) throw new Error(r.errors[0].message);
    const la = byInc(r, 243)!;
    expect(la).toMatchObject({ id: 582628, price_actual: -4500 });
    expect(r.errors).toEqual([]);
  });

  it('recalculating the payload twice is stable (idempotent)', () => {
    const args = { system: p.system as System, house: p.house, customer: p.customer, ahriRecord: { id: 2965, cooling_95: 22000, heating_47: 25000 } as any, refData: sampleRefData, ctx };
    const a = recalculateSystem({ ...args, lineItems: p.lineItems });
    if (!a.ok) throw new Error(a.errors[0].message);
    const b = recalculateSystem({ ...args, lineItems: a.lineItems });
    if (!b.ok) throw new Error(b.errors[0].message);
    expect(b.lineItems).toEqual(a.lineItems);
  });
});

/* ------------------------------------------------------------------ */
/* recalculateSystem                                                   */
/* ------------------------------------------------------------------ */

describe('recalculateSystem', () => {
  const incentives = [inc({ id: 91, amount: amt('full install', 0.2) }), inc({ id: 92, finance_fee: 100, amount: amt('full install', 0.1) })];
  const permit: LineItem = { id: 60, system_id: 1, line_item_type: 'permit', permit_id: 1, description: 'HVAC permit', price_actual: 210, state: 'persisted' };
  const base = () => ({ system: sys(), house: sampleHouses.co, customer: sampleCustomer(), ahriRecord: AHRI as any, refData: rd(incentives), ctx: { now: NOW, houseSystems: [], permitLineItems: [], incentivesForLimits: [] } as SpecIncentivesContext });

  it('is idempotent: running it on its own output yields identical lines', () => {
    const a = recalculateSystem({ ...base(), lineItems: jobLines() });
    if (!a.ok) throw new Error('x');
    const b = recalculateSystem({ ...base(), lineItems: a.lineItems });
    if (!b.ok) throw new Error('x');
    expect(b.lineItems).toEqual(a.lineItems);
    expect(b.upserts).toEqual(a.upserts);
    // and a third time with the DB-ish shape (ids assigned to the new lines)
    const withIds = a.lineItems.map((l, i) => (l.id === undefined ? { ...l, id: 1000 + i } : l));
    const c = recalculateSystem({ ...base(), lineItems: withIds });
    const d = recalculateSystem({ ...base(), lineItems: c.ok ? c.lineItems : [] });
    expect(c.ok && d.ok && d.lineItems).toEqual(c.ok && c.lineItems);
  });

  it('upserts carry system_id, no temp_id; permit lines are never written; margin line present with ~target effective margin', () => {
    const r = recalculateSystem({ ...base(), lineItems: [...jobLines(), permit] });
    if (!r.ok) throw new Error('x');
    expect(r.upserts.every((l) => l.system_id === 1 && !('temp_id' in l))).toBe(true);
    expect(r.upserts.some((l) => l.line_item_type === 'permit')).toBe(false);
    expect(r.margin.price_actual).toBe(625);
    expect(effectiveMargin(r.lineItems)).toBeCloseTo(0.2, 6);
    expect(sumMargin(r.lineItems)).toBe(625);
  });

  it('stale incentive lines are listed in deletes (ids no longer produced)', () => {
    const stale: LineItem = { id: 55, system_id: 1, line_item_type: 'incentive', incentive_id: 12345, description: 'No longer eligible', price_actual: -500, state: 'persisted' };
    const kept: LineItem = { id: 56, system_id: 1, line_item_type: 'incentive', incentive_id: 91, description: incentives[0].name, price_actual: -1, state: 'persisted' };
    const r = recalculateSystem({ ...base(), lineItems: [...jobLines(), stale, kept] });
    if (!r.ok) throw new Error('x');
    expect(r.deletes).toEqual([55]);
    expect(r.upserts.find((l) => l.incentive_id === 91)).toMatchObject({ id: 56, price_actual: -625 });
  });

  it('lines without a state are treated as persisted (assumePersisted) so the margin is recomputed', () => {
    const noState = jobLines().map(({ state: _s, ...l }) => l);
    const r = recalculateSystem({ ...base(), lineItems: noState });
    if (!r.ok) throw new Error('x');
    expect(r.margin.price_actual).toBe(625);
    const off = recalculateSystem({ ...base(), lineItems: noState, assumePersisted: false });
    if (!off.ok) throw new Error('x');
    expect(off.margin.price_actual).toBe(0);
  });

  it('a manually excluded line (margin_to_include false) stays at 0 margin', () => {
    const lines = jobLines().map((l) => (l.id === 1 ? { ...l, margin_to_include: false } : l));
    const r = recalculateSystem({ ...base(), lineItems: lines });
    if (!r.ok) throw new Error('x');
    expect(r.margin.price_actual).toBe(375);
  });

  it('returns a typed failure instead of throwing', () => {
    const r = recalculateSystem({ ...base(), lineItems: undefined as any });
    expect(r.ok).toBe(false);
    const bad = specIncentives({ system: undefined as any, lineItems: [], house: sampleHouses.co }, rd([]), { now: NOW });
    expect(bad.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* provider (specAndPriceSystem integration)                           */
/* ------------------------------------------------------------------ */

describe('createIncentivesProvider', () => {
  const ctx = { now: '2026-10-15T00:00:00Z' };

  it('plugs into specAndPriceSystem: margin line + incentives; default (noIncentives) still adds none', () => {
    const input = { ...sampleSystemInputs.hvacMiniSplitSixHeads, specIncentives: { ...sampleSystemInputs.hvacMiniSplitSixHeads.specIncentives, house: { ...sampleHouses.co, electric_utility: 'Xcel Energy' }, customer: sampleCustomer() } };
    const plain = specAndPriceSystem(input, sampleRefData, ctx);
    if (!plain.ok) throw new Error('x');
    expect(plain.proposals[0].lineItems.some((l) => l.line_item_type === 'margin')).toBe(false);

    const withInc = specAndPriceSystem(input, sampleRefData, { ...ctx, incentives: createIncentivesProvider(sampleRefData, { permitLineItems: [] }) });
    if (!withInc.ok) throw new Error('x');
    const lines = withInc.proposals[0].lineItems;
    const margin = lines.filter((l) => l.line_item_type === 'margin');
    expect(margin).toHaveLength(1);
    expect(effectiveMargin(lines)).toBeCloseTo(Number(withInc.proposals[0].system.target_margin), 2);
    expect(lines.every((l) => l.line_item_type === 'margin' || l.line_item_type === 'incentive' || Number.isFinite(Number(l.margin_amount)))).toBe(true);
    expect(lines.filter((l) => l.line_item_type === 'incentive').every((l) => Number(l.price_actual) <= 0 || String(l.description).startsWith('Finance Charge'))).toBe(true);
  });

  it('returns the lines unchanged plus an error when no clock is available', () => {
    const p = createIncentivesProvider(sampleRefData);
    const res = p({ input: sampleSystemInputs.adder, system: {} as any, proposalId: 1, lineItems: [{ line_item_type: 'labor', price_actual: 1 }], refData: sampleRefData });
    expect(res.result).toHaveLength(1);
    expect(res.errors![0].message).toContain('no clock');
  });
});

/* ------------------------------------------------------------------ */
/* financing fees                                                      */
/* ------------------------------------------------------------------ */

describe('calculateFinancingFees (Synchrony)', () => {
  const mitsubishiCondenser = (price: number): LineItem => ({ id: price, line_item_type: 'labor', description: 'Condenser', equipment_id: 380, price_actual: price });
  const systemA = { id: 1, system_type: 'hvac', line_items: [mitsubishiCondenser(6000), { id: 11, line_item_type: 'margin', price_actual: 2000 }, { id: 12, line_item_type: 'incentive', price_actual: -500 }] };
  const systemB = { id: 2, system_type: 'hvac', line_items: [mitsubishiCondenser(4000), { id: 21, line_item_type: 'margin', price_actual: 1500 }, { id: 22, line_item_type: 'financing fees', price_actual: -90, margin_amount: -9 }] };
  const project = { lender: 'Synchrony, Sunlight', financing_amounts: [{ lender: 'Synchrony', amount: 30000 }] };

  it('shares -7% (price) and -0.7% (margin) by price proportion; margin lines are adjusted by the change in fee margin', () => {
    const r = calculateFinancingFees({ systems: [systemA, systemB], project, equipment: sampleRefData });
    expect(r.upserts).toEqual([
      { price_actual: -1260, margin_amount: -126, line_item_type: 'financing fees', description: 'Synchrony Financing Fee', system_id: 1 },
      { id: 22, price_actual: -840, margin_amount: -84, line_item_type: 'financing fees', description: 'Synchrony Financing Fee', system_id: 2 },
    ]);
    expect(r.marginUpdates).toEqual([
      { id: 11, price_actual: 1874 }, // 2000 - 0 + (-126)
      { id: 21, price_actual: 1425 }, // 1500 - (-9) + (-84)
    ]);
  });
  it('financing fee lines and incentives are not part of the system price used for the proportion', () => {
    const r = calculateFinancingFees({ systems: [systemA], project, equipment: sampleRefData.equipment });
    expect(r.upserts[0].price_actual).toBe(-2100); // single system: 100 % of 7 % of 30000
  });
  it('no Synchrony / zero amount / non-Mitsubishi / non-hvac / no condenser -> nothing', () => {
    const none = { upserts: [], marginUpdates: [] };
    expect(calculateFinancingFees({ systems: [systemA], project: { ...project, lender: 'Other' }, equipment: sampleRefData })).toEqual(none);
    expect(calculateFinancingFees({ systems: [systemA], project: { ...project, financing_amounts: [{ lender: 'Synchrony', amount: 0 }] }, equipment: sampleRefData })).toEqual(none);
    expect(calculateFinancingFees({ systems: [systemA], project: { lender: 'Synchrony' }, equipment: sampleRefData })).toEqual(none);
    expect(calculateFinancingFees({ systems: [{ ...systemA, system_type: 'water heater' }], project, equipment: sampleRefData })).toEqual(none);
    expect(calculateFinancingFees({ systems: [{ id: 3, system_type: 'hvac', line_items: [] }], project, equipment: sampleRefData })).toEqual(none);
    const bosch = sampleRefData.equipment.find((e) => e.equipment_type === 'Condenser' && e.manufacturer !== 'Mitsubishi');
    if (bosch) expect(calculateFinancingFees({ systems: [{ id: 4, system_type: 'hvac', line_items: [{ line_item_type: 'labor', description: 'Condenser', equipment_id: bosch.id, price_actual: 100 }] }], project, equipment: sampleRefData })).toEqual(none);
    expect(calculateFinancingFees({ systems: [systemA], project: null, equipment: sampleRefData })).toEqual(none);
  });
  it('lender may be a list', () => {
    expect(calculateFinancingFees({ systems: [systemA], project: { ...project, lender: ['Synchrony'] }, equipment: sampleRefData }).upserts).toHaveLength(1);
  });
});
