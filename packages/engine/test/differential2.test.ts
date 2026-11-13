/* Differential tests for the other two parts of the recalculation chain, against Retool's ORIGINAL code:
   - specPermits (legacy/workflows/specPermits/specPermits.js): permit line items after a design change
   - calculateLineItemFee (legacy/page-logic/calculateLineItemFee.js): the Synchrony financing fee and its margin adjustment */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateFinancingFees, sampleRefData, selectPermitsForHouse, specPermits } from '../src';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...args: unknown[]) => Promise<any>;
const read = (p: string) => readFileSync(new URL(`../../../legacy/${p}`, import.meta.url), 'utf8');
const SPEC_PERMITS = read('workflows/specPermits/specPermits.js');
const FEE = read('page-logic/calculateLineItemFee.js');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const num = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

describe('specPermits: original Retool code vs the port', () => {
  const N = 1500;
  it(`${N} random houses, permit tables and proposals give the same permit lines and deletions`, async () => {
    const bad: string[] = [];
    const cover: Record<string, number> = {};
    const hit = (k: string) => { cover[k] = (cover[k] ?? 0) + 1; };
    for (let seed = 1; seed <= N; seed++) {
      const r = rng(seed * 7919);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const chance = (p: number) => r() < p;
      const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
      const house = { id: 140, state: pick(['CO', 'MA', 'CA', null]), city: pick(['Denver', 'Boulder', 'Reading', null]), county: pick(['Boulder', 'Denver', 'Middlesex', null]) } as any;

      const types = ['hvac', 'electrical', 'plumbing'];
      const permits: any[] = [];
      for (let i = 0; i < int(2, 9); i++) {
        const jt = pick(['state', 'city', 'county', 'other']);
        const cost = chance(0.3) ? { multiplier_type: pick(['hvac', 'hvac', 'bogus']), multiplier_value: pick([0.01, 0.02, 0, null]) } : pick([100, 250, 400.5]);
        permits.push({ id: 100 + i * 3 + int(0, 2), name: 'Permit ' + i, permit_type: pick(types), jurisdiction: jt === 'state' ? (chance(0.7) ? house.state : pick(['CO', 'MA', 'CA'])) : jt === 'city' ? (chance(0.7) ? house.city : pick(['Denver', 'Boulder', 'Reading'])) : jt === 'county' ? (chance(0.7) ? house.county : pick(['Boulder', 'Denver', 'Middlesex'])) : null, jurisdiction_type: jt, price: chance(0.05) ? {} : { cost } });
      }
      const labor = [{ id: 1, category: 'electrical' }, { id: 2, category: 'hvac' }, { id: 3, category: 'plumbing' }, { id: 4, category: 'other' }].filter(() => chance(0.95));

      const systems: any[] = [];
      const proposalId = pick([9919, 9920]);
      const sysTypes = ['hvac', 'water heater', 'panel', 'other'];
      for (let i = 0; i < int(2, 6); i++) {
        systems.push({ id: 5000 + i, house_id: chance(0.95) ? 140 : 141, proposal_id: chance(0.85) ? proposalId : 9920, system_type: pick(sysTypes), system_status: pick(['proposed', 'proposed', 'proposed', 'proposed', 'active', 'pending deletion', 'proposed - from change order', null]) });
      }
      if (chance(0.97) && !systems.some((s) => s.system_type === 'other' && s.proposal_id === proposalId && s.house_id === 140)) systems.push({ id: 5100, house_id: 140, proposal_id: proposalId, system_type: 'other', system_status: 'proposed' });
      const lines: any[] = [];
      let lid = 70000;
      for (const s of systems) {
        for (let i = 0; i < int(0, 4); i++) {
          const kind = pick(['labor', 'equipment', 'incentive', 'margin', 'discount']);
          lines.push({ id: lid++, system_id: s.id, line_item_type: kind, labor_id: kind === 'labor' ? pick([1, 2, 3, 1, 2, 3, 4, 99]) : null, price_actual: kind === 'incentive' || kind === 'discount' ? -int(10, 900) : int(50, 5000), status: pick([null, null, null, 'pending deletion', 'proposed - from change order']), description: 'x' });
        }
        if (s.system_type === 'other' && chance(0.7)) lines.push({ id: lid++, system_id: s.id, line_item_type: 'permit', permit_id: pick(permits).id, price_actual: 123, status: null, description: 'old permit' });
      }

      // --- original ---
      const deleted: number[] = [];
      let orig: any, origErr: string | null = null;
      try {
        const startTrigger = { data: { house: clone(house), proposalId } };
        const mockPermits = async (h: any) => ({ data: clone(selectPermitsForHouse(clone(permits), h)) });
        const mockSystems = async (houseId: number) => ({ data: clone(systems.filter((s) => s.house_id === houseId && s.system_status != null && !['proposed - from change order', 'deleted - from change order', 'pending deletion'].includes(s.system_status))) });
        const mockLines = async (ids: number[]) => ({ data: clone(lines.filter((l) => ids.includes(l.system_id) && (l.status == null || !['proposed - from change order', 'deleted - from change order', 'pending deletion'].includes(l.status)))) });
        const mockLabor = async (ids: number[]) => ({ data: clone(labor.filter((l) => ids.includes(l.id))) });
        orig = await new AsyncFunction('startTrigger', 'permits', 'systems', 'line_items', 'labor_filtered', 'delete_line_item_js', 'console', SPEC_PERMITS)(startTrigger, mockPermits, mockSystems, mockLines, mockLabor, (id: number) => { deleted.push(id); }, silent);
      } catch (e: any) { origErr = String(e?.message ?? e); }

      // --- port ---
      const refData = { permits: clone(permits), labor: clone(labor) } as any;
      const ts = specPermits({ house: clone(house), proposalId, systems: clone(systems), lineItems: clone(lines) }, refData);
      if (origErr) { if (ts.ok) bad.push(`seed ${seed}: original threw "${origErr.slice(0, 80)}" port ok`); continue; }
      if (!ts.ok) { bad.push(`seed ${seed}: port failed ${ts.errors[0]?.message}`); continue; }
      const key = (l: any) => ({ id: l.id ?? null, system_id: l.system_id, permit_id: l.permit_id, price_actual: num(l.price_actual), description: l.description });
      const a = ((orig as any[]) ?? []).map(key), b = ts.lineItems.map(key);
      hit('scenarios'); if (a.length) hit('permit lines produced'); if (a.some((x) => x.id !== null)) hit('existing permit line updated in place'); if (deleted.length) hit('stale permit deleted'); if (house.state === 'MA' && a.length) hit('MA $100 added');
      if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`seed ${seed}: permit lines differ\n   orig ${JSON.stringify(a)}\n   port ${JSON.stringify(b)}`);
      else if (JSON.stringify([...deleted].sort()) !== JSON.stringify([...ts.writes.deletes].sort())) bad.push(`seed ${seed}: deletions differ orig ${JSON.stringify(deleted)} port ${JSON.stringify(ts.writes.deletes)}`);
    }
    console.log('specPermits coverage:', JSON.stringify(cover));
    if (bad.length) console.log(`${bad.length} differ:\n` + bad.slice(0, 8).join('\n'));
    expect(bad.length).toBe(0);
  }, 120_000);
});

describe('calculateLineItemFee: original Retool code vs the port', () => {
  const N = 1500;
  it(`${N} random projects give the same fee lines and margin updates`, async () => {
    const bad: string[] = [];
    const cover: Record<string, number> = {};
    const hit = (k: string) => { cover[k] = (cover[k] ?? 0) + 1; };
    const condensers = sampleRefData.equipment.filter((e) => e.equipment_type === 'Condenser');
    for (let seed = 1; seed <= N; seed++) {
      const r = rng(seed * 104729);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const chance = (p: number) => r() < p;
      const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
      const systems: any[] = [];
      let lid = 1000;
      for (let i = 0; i < int(1, 4); i++) {
        const type = pick(['hvac', 'hvac', 'water heater']);
        const c = pick(condensers);
        const items: any[] = [];
        if (chance(0.9)) items.push({ id: lid++, line_item_type: 'equipment', description: 'Condenser', equipment_id: c.id, price_actual: int(3000, 9000) });
        for (let k = 0; k < int(0, 3); k++) items.push({ id: lid++, line_item_type: pick(['labor', 'equipment', 'discount', 'incentive', 'permit']), description: 'x', price_actual: int(-900, 4000) });
        if (chance(0.8)) items.push({ id: lid++, line_item_type: 'margin', price_actual: int(500, 3000) });
        if (chance(0.4)) items.push({ id: lid++, line_item_type: 'financing fees', description: 'Synchrony Financing Fee', price_actual: -int(100, 900), margin_amount: -int(10, 90) });
        systems.push({ id: 200 + i, system_type: type, line_items: items });
      }
      const lenderForm = pick([['Synchrony'], ['Synchrony', 'Other'], ['MassSave'], 'Synchrony', '', null, undefined]);
      const amt = pick([0, 15000, 30000, undefined]);
      const project: any = { lender: lenderForm, financing_amounts: chance(0.9) ? [{ lender: 'Synchrony', amount: amt }, { lender: 'Other', amount: 5000 }] : null };

      let orig: any, origErr: string | null = null;
      try { orig = await new AsyncFunction('getLineItemsForAProposal', 'project', 'equipmentsData', 'console', FEE)({ data: clone(systems) }, { data: clone(project) }, { data: clone(sampleRefData.equipment) }, silent); } catch (e: any) { origErr = String(e?.message ?? e); }
      let ts: any, tsErr: string | null = null;
      try { ts = calculateFinancingFees({ systems: clone(systems), project: clone(project), equipment: sampleRefData.equipment }); } catch (e: any) { tsErr = String(e?.message ?? e); }
      if (origErr || tsErr) { if (!!origErr !== !!tsErr) bad.push(`seed ${seed}: threw differently orig=${origErr} port=${tsErr}`); continue; }
      const up = (x: any) => ({ id: x.id ?? null, price_actual: num(x.price_actual), margin_amount: num(x.margin_amount), system_id: x.system_id, description: x.description });
      const a = orig.upserts.map(up), b = ts.upserts.map(up);
      hit('scenarios'); if (a.length) hit('fee produced'); if (a.some((x: any) => x.id !== null)) hit('existing fee updated');
      const ma = orig.marginUpdates.map((m: any) => ({ id: m.id ?? null, price_actual: num(m.price_actual) })), mb = ts.marginUpdates.map((m: any) => ({ id: m.id ?? null, price_actual: num(m.price_actual) }));
      if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`seed ${seed}: fee lines differ\n   orig ${JSON.stringify(a)}\n   port ${JSON.stringify(b)}`);
      else if (JSON.stringify(ma) !== JSON.stringify(mb)) bad.push(`seed ${seed}: margin updates differ orig ${JSON.stringify(ma)} port ${JSON.stringify(mb)}`);
    }
    console.log('financing fee coverage:', JSON.stringify(cover));
    if (bad.length) console.log(`${bad.length} differ:\n` + bad.slice(0, 8).join('\n'));
    expect(bad.length).toBe(0);
  }, 120_000);
});
