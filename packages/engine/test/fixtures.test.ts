import { describe, expect, it } from 'vitest';
import { sampleRefData } from '../src';

const count = (type: string) => sampleRefData.equipment.filter((e) => e.equipment_type === type).length;

describe('sample RefData', () => {
  it('is big enough to exercise the engine', () => {
    expect(count('Condenser')).toBeGreaterThanOrEqual(12);
    expect(count('AHU')).toBeGreaterThanOrEqual(8);
    expect(count('Wall Head') + count('Floor Head')).toBeGreaterThanOrEqual(10);
    expect(count('HPWH')).toBeGreaterThanOrEqual(4);
    expect(count('EV Charger')).toBeGreaterThanOrEqual(3);
    expect(count('Thermostat')).toBeGreaterThan(0);
    expect(count('Branch Box')).toBeGreaterThanOrEqual(4);
    expect(sampleRefData.labor.filter((l) => l.subcategory === 'circuit').length).toBeGreaterThanOrEqual(8);
    for (const cat of ['hvac', 'electrical', 'plumbing', 'energy efficiency', 'other']) {
      expect(sampleRefData.labor.some((l) => l.category === cat), cat).toBe(true);
    }
    expect(new Set(sampleRefData.permits.map((p) => p.jurisdiction)).has('MA')).toBe(true);
    expect(sampleRefData.incentives.length).toBeGreaterThan(0);
  });

  it('keeps the real ids from the Retool example payloads', () => {
    const e = (id: number) => sampleRefData.equipment.find((x) => x.id === id);
    expect(e(380)).toMatchObject({ model_number: 'MXZ-SM42NLHZ', equipment_name: 'Mitsubishi 3.5 Ton SmartMulti HyperHeat Condenser' });
    expect(e(38)).toMatchObject({ model_number: 'QSMS1202' });
    expect(sampleRefData.labor.find((l) => l.id === 19)?.name).toBe('Condenser');
  });

  it('has unique ids and every referenced equipment / labor id exists', () => {
    const ids = sampleRefData.equipment.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const lids = sampleRefData.labor.map((l) => l.id);
    expect(new Set(lids).size).toBe(lids.length);
    const eqSet = new Set(ids);
    for (const e of sampleRefData.equipment) {
      for (const a of e.additional_equipment_ids ?? []) expect(eqSet.has(a), `equipment ${e.id} -> ${a}`).toBe(true);
      if (e.labor_id) expect(lids.includes(e.labor_id), `equipment ${e.id} labor ${e.labor_id}`).toBe(true);
    }
    const pids = sampleRefData.prices.map((p) => p.id);
    expect(new Set(pids).size).toBe(pids.length);
  });

  it('has a price in every territory for every equipment and labor row', () => {
    for (const territory of ['CO', 'MA', 'MA-Laminar', 'CA', 'iChoosr26']) {
      const rows = sampleRefData.prices.filter((p) => p.territory === territory);
      for (const e of sampleRefData.equipment) expect(rows.some((p) => p.equipment_id === e.id), `${territory} eq ${e.id}`).toBe(true);
      for (const l of sampleRefData.labor) expect(rows.some((p) => p.labor_id === l.id), `${territory} labor ${l.id}`).toBe(true);
    }
  });

  it('is JSON-serialisable (usable as a mock DB seed)', () => {
    expect(JSON.parse(JSON.stringify(sampleRefData)).equipment).toHaveLength(sampleRefData.equipment.length);
  });
});
