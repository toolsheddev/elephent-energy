import { describe, expect, it } from 'vitest';
import {
  getHvacSystemType,
  priceLineItems,
  sampleRefData,
  samplePriceLineItemsInput,
  type LineItem,
} from '../src';

const opts = { pricingStructure: 'standard' as const, pricingEffectiveDate: '2026-06-20' };

describe('getHvacSystemType', () => {
  const eq = (id: number): LineItem => ({ equipment_id: id, line_item_type: 'equipment' });
  it('null when no indoor equipment', () => {
    expect(getHvacSystemType([eq(380)], sampleRefData)).toBeNull();
    expect(getHvacSystemType([], sampleRefData)).toBeNull();
  });
  it('ducted / ductless / mixed', () => {
    expect(getHvacSystemType([eq(380), eq(431)], sampleRefData)).toBe('ducted');
    expect(getHvacSystemType([eq(380), eq(326)], sampleRefData)).toBe('ductless');
    expect(getHvacSystemType([eq(431), eq(326)], sampleRefData)).toBe('mixed');
    expect(getHvacSystemType([eq(326), eq(431)], sampleRefData)).toBe('mixed');
    expect(getHvacSystemType([eq(431), eq(326), eq(431)], sampleRefData)).toBe('mixed');
  });
  it('furnace alone is not counted; dual-fuel coil is ducted; horizontal-ducted head is ducted', () => {
    expect(getHvacSystemType([eq(484)], sampleRefData)).toBeNull();
    expect(getHvacSystemType([eq(474)], sampleRefData)).toBe('ducted');
    expect(getHvacSystemType([eq(145)], sampleRefData)).toBe('ducted');
  });
  it('ignores labor rows and non-equipment line item types', () => {
    expect(getHvacSystemType([{ equipment_id: 431, labor_id: 20, line_item_type: 'labor' }], sampleRefData)).toBeNull();
  });
  it('throws on unknown equipment', () => {
    expect(() => getHvacSystemType([eq(999999)], sampleRefData)).toThrow(/no equipment row/);
  });
});

describe('priceLineItems', () => {
  const input = samplePriceLineItemsInput;
  const res = priceLineItems(input.lineItems, sampleRefData, opts);

  it('prices the example payload without errors', () => {
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.errors).toEqual([]);
    expect(res.systemType).toBe('ducted');
    for (const li of res.result) expect(Number.isFinite(li.price_actual as number)).toBe(true);
  });

  it('reproduces the prices visible in the Retool example payload', () => {
    if (!res.ok) throw new Error('not ok');
    const price = (i: number) => res.result[i].price_actual;
    expect(price(0)).toBe(6277.56); // condenser 380
    expect(price(1)).toBe(3500); // labor 19 Condenser
    expect(price(2)).toBe(0); // QuickSling stand
    expect(price(5)).toBe(2229.05); // AHU 431
    expect(price(6)).toBe(4500); // labor 20 AHU
    expect(price(7)).toBe(379.05); // MHK2
    expect(price(8)).toBe(400); // first circuit: 250 + 150 first-circuit adder
    expect(price(12)).toBe(250); // second circuit has no adder
    expect(price(14)).toBe(565.75); // branch box
    expect(price(15)).toBe(575); // 45A 240V circuit, 5 ft
  });

  it('circuit price = min(base + perFt*len, cap) (+ adder once), quantity multiplies', () => {
    if (!res.ok) throw new Error('not ok');
    // labor 4 (50A 240V): base 100+8*50=500, easy 3+5=8 -> difficult 13.6, qty 2, length 10 difficult
    expect(res.result[16].price_actual).toBeCloseTo((500 + 13.6 * 10) * 2, 6);
    const long = priceLineItems(
      [{ labor_id: 4, line_item_type: 'labor', additional_data: { electrical: { circuit_length: 1000 } } }],
      sampleRefData,
      opts,
    );
    if (!long.ok) throw new Error('not ok');
    expect(long.result[0].price_actual).toBe(150 + 2000); // capped (4 x base) + first circuit adder
  });

  it('does not mutate its input and keeps order', () => {
    const copy = JSON.parse(JSON.stringify(input.lineItems));
    priceLineItems(input.lineItems, sampleRefData, opts);
    expect(input.lineItems).toEqual(copy);
    if (!res.ok) throw new Error('not ok');
    expect(res.result).toHaveLength(input.lineItems.length);
    expect(res.result.map((r) => r.equipment_id ?? null)).toEqual(input.lineItems.map((r) => r.equipment_id ?? null));
  });

  it('total equals the sum of the lines', () => {
    if (!res.ok) throw new Error('not ok');
    const total = res.result.reduce((s, li) => s + (li.price_actual as number), 0);
    const expected =
      6277.56 + 3500 + 0 + 0 + 0 + // condenser, install, stand, pad, guarantee
      2229.05 + 4500 + 379.05 + 400 + // AHU 1 + MHK2 + first GFI circuit
      Number(res.result[9].price_actual) + 4500 + 379.05 + 250 + // AHU 2 chain
      0 + 565.75 + 575 + (500 + 13.6 * 10) * 2;
    expect(total).toBeCloseTo(expected as number, 2);
  });

  it('uses system-type specific labor price, falling back to the generic row', () => {
    const ductless = priceLineItems(
      [{ equipment_id: 380, line_item_type: 'equipment' }, { equipment_id: 326, line_item_type: 'equipment' }, { labor_id: 19, line_item_type: 'labor' }],
      sampleRefData,
      opts,
    );
    if (!ductless.ok) throw new Error('not ok');
    expect(ductless.systemType).toBe('ductless');
    expect(ductless.result[2].price_actual).toBe(3250);
    const ducted = priceLineItems([{ equipment_id: 431, line_item_type: 'equipment' }, { labor_id: 19, line_item_type: 'labor' }], sampleRefData, opts);
    if (!ducted.ok) throw new Error('not ok');
    expect(ducted.result[1].price_actual).toBe(3500);
  });

  it('applies the territory of the pricing structure', () => {
    const ma = priceLineItems([{ equipment_id: 380, line_item_type: 'equipment' }], sampleRefData, { ...opts, pricingStructure: 'ma_forge' });
    if (!ma.ok) throw new Error('not ok');
    expect(ma.result[0].price_actual).toBeCloseTo(6277.56 * 1.12, 2);
  });

  it('honours the effective date (expired rows excluded)', () => {
    const old = priceLineItems([{ equipment_id: 380, line_item_type: 'equipment' }], sampleRefData, { ...opts, pricingEffectiveDate: '2024-06-01' });
    if (!old.ok) throw new Error('not ok');
    expect(old.result[0].price_actual).toBe(5999);
    const none = priceLineItems([{ equipment_id: 431, line_item_type: 'equipment' }], sampleRefData, { ...opts, pricingEffectiveDate: '2024-06-01' });
    if (!none.ok) throw new Error('not ok');
    expect(none.errors[0].message).toMatch(/No price found for equipment id 431/);
  });

  it('collects per-item errors without failing the call', () => {
    const r = priceLineItems(
      [{ equipment_id: 380, line_item_type: 'equipment' }, { equipment_id: 424242, line_item_type: 'equipment' }, { labor_id: 4, line_item_type: 'labor' }],
      { ...sampleRefData, equipment: [...sampleRefData.equipment, { id: 424242, equipment_name: 'Unpriced', model_number: 'X', equipment_type: 'Accessory' }] },
      opts,
    );
    if (!r.ok) throw new Error('not ok');
    expect(r.errors.map((e) => e.lineItemIndex)).toEqual([1, 2]); // second: circuit without length
    expect(r.errors[0].message).toBe('No price found for equipment id 424242');
    expect(r.errors[1].message).toMatch(/no valid length defined for circuit/);
    expect(r.result[0].price_actual).toBe(6277.56);
  });

  it('invalid pricing structure is reported per item', () => {
    const r = priceLineItems([{ equipment_id: 380, line_item_type: 'equipment' }], sampleRefData, { ...opts, pricingStructure: 'bogus' });
    if (!r.ok) throw new Error('not ok');
    expect(r.errors[0].message).toMatch(/bogus is not a valid pricing structure/);
  });

  it('fails (ok:false) for non-array input or missing date', () => {
    expect(priceLineItems(undefined as any, sampleRefData, opts).ok).toBe(false);
    expect(priceLineItems([], sampleRefData, { pricingStructure: 'standard' }).ok).toBe(false);
    expect(priceLineItems([], sampleRefData, { pricingStructure: 'standard', now: new Date('2026-01-01') }).ok).toBe(true);
  });

  it('discount items keep their price; permit/incentive items are left alone', () => {
    const r = priceLineItems(
      [{ line_item_type: 'discount', price_actual: -500 }, { line_item_type: 'permit', price_actual: 210 }, { line_item_type: 'incentive', price_actual: -1500 }],
      sampleRefData,
      opts,
    );
    if (!r.ok) throw new Error('not ok');
    expect(r.result.map((i) => i.price_actual)).toEqual([-500, 210, -1500]);
  });
});
