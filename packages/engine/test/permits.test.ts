import { describe, expect, it } from 'vitest';
import { sampleHouses, samplePermitsInputs, sampleRefData, selectPermitsForHouse, specPermits } from '../src';

describe('selectPermitsForHouse', () => {
  it('state beats city beats county beats other, per permit type', () => {
    const ny = selectPermitsForHouse(sampleRefData.permits, { state: 'NY', city: 'New York', county: 'Westchester' });
    const byType = Object.fromEntries(ny.map((p) => [p.permit_type, p.name]));
    expect(byType.hvac).toBe('New York HVAC Permit'); // state wins over Westchester county
    expect(byType.electrical).toBe('New York Electrical Permit');
    expect(byType.plumbing).toBe('City of New York Plumbing Permit'); // no state plumbing -> city
  });
  it('falls back to "other" and matches nothing for null jurisdiction values', () => {
    const r = selectPermitsForHouse(sampleRefData.permits, { state: 'TX', city: null, county: null });
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([11, 12]);
  });
});

describe('specPermits', () => {
  it('CO: one permit per type, HVAC permit is a % of the HVAC system line items', () => {
    const r = specPermits(samplePermitsInputs.co, sampleRefData);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byPermit = Object.fromEntries(r.lineItems.map((p) => [p.permit_id, p]));
    // hvac-system line items (incentives excluded): 6277.56 + 3500 + 725 = 10502.56 * 0.02 -> 210
    expect(byPermit[1].price_actual).toBe(210);
    expect(byPermit[2].price_actual).toBe(150);
    expect(byPermit[3].price_actual).toBe(175);
    for (const p of r.lineItems) {
      expect(p.line_item_type).toBe('permit');
      expect(p.system_id).toBe(7003); // catch-all 'other' system
    }
  });

  it('writes: updates keep ids, stale permits are deleted, new ones inserted', () => {
    const r = specPermits(samplePermitsInputs.co, sampleRefData);
    if (!r.ok) throw new Error('not ok');
    expect(r.writes.updates.map((u) => u.permit_id)).toEqual([1]);
    expect(r.writes.updates[0].id).toBe(70037);
    expect(r.writes.inserts.map((u) => u.permit_id).sort()).toEqual([2, 3]);
    expect(r.writes.deletes).toEqual([70038]);
    expect(r.lineItems).toHaveLength(r.writes.inserts.length + r.writes.updates.length);
  });

  it('MA: +$100 per permit', () => {
    const r = specPermits(samplePermitsInputs.ma, sampleRefData);
    if (!r.ok) throw new Error('not ok');
    const byId = Object.fromEntries(r.lineItems.map((p) => [p.permit_id, p.price_actual]));
    expect(byId).toEqual({ 4: 350, 5: 300, 6: 280 });
  });

  it('NY: city plumbing permit used, no state surcharge', () => {
    const r = specPermits(samplePermitsInputs.ny, sampleRefData);
    if (!r.ok) throw new Error('not ok');
    expect(Object.fromEntries(r.lineItems.map((p) => [p.permit_id, p.price_actual]))).toEqual({ 7: 300, 8: 225, 9: 260 });
  });

  it('only specs a permit when the proposal has labor of that category', () => {
    const input = { ...samplePermitsInputs.co, lineItems: samplePermitsInputs.co.lineItems.filter((li) => li.labor_id !== 47) };
    const r = specPermits(input, sampleRefData);
    if (!r.ok) throw new Error('not ok');
    expect(r.lineItems.map((p) => p.permit_id).sort()).toEqual([1, 2]);
  });

  it('returns empty (not an error) for missing proposal / systems / catch-all system', () => {
    const base = samplePermitsInputs.co;
    for (const input of [
      { ...base, proposalId: null },
      { ...base, proposalId: 424242 },
      { ...base, systems: base.systems.filter((s) => s.system_type !== 'other') },
      { ...base, house: { ...sampleHouses.co, id: 1 } },
    ]) {
      const r = specPermits(input, sampleRefData);
      expect(r).toMatchObject({ ok: true, lineItems: [], writes: { inserts: [], updates: [], deletes: [] } });
    }
  });

  it('skips permits with an unknown cost structure', () => {
    const refData = {
      ...sampleRefData,
      permits: sampleRefData.permits.map((p) => (p.id === 1 ? { ...p, price: { cost: { multiplier_type: 'plumbing' } } as any } : p)),
    };
    const r = specPermits(samplePermitsInputs.co, refData);
    if (!r.ok) throw new Error('not ok');
    expect(r.lineItems.map((p) => p.permit_id).sort()).toEqual([2, 3]);
    expect(r.notes.join(' ')).toMatch(/Invalid multiplier/);
  });
});
