import { describe, expect, it } from 'vitest';
import {
  asEditInput,
  computeSurgeCounts,
  computeWarrantyCounts,
  findAhriRecord,
  makeSystemInput,
  parseProposals,
  priceLineItems,
  sampleHouses,
  sampleRefData,
  sampleSystemInputs,
  specAndPriceSystem,
  specEquipment,
  specSystemDetails,
  sqlLike,
  ahuUnit,
  type LineItem,
  type SpecSystemDetailsOk,
  type SystemInput,
} from '../src';

function ok(input: SystemInput, ctx = {}, refData = sampleRefData): SpecSystemDetailsOk {
  const r = specSystemDetails(input, refData, ctx);
  if (!r.ok) throw new Error('spec failed: ' + r.errors[0].message);
  return r;
}
const ofLabor = (r: SpecSystemDetailsOk, id: number) => r.lineItems.filter((li) => li.labor_id === id);
const ofEquip = (r: SpecSystemDetailsOk, id: number) => r.lineItems.filter((li) => li.equipment_id === id && !li.labor_id);

describe('specSystemDetails - every sample input', () => {
  for (const [name, input] of Object.entries(sampleSystemInputs)) {
    it(`${name}: no throw, well-formed line items`, () => {
      const r = specSystemDetails(input, sampleRefData, {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.newSystem.system_type).toBe(input.cost_system_type);
      expect(r.newSystem.target_margin).toBe(0.25);
      for (const li of r.lineItems) {
        expect(li.equipment_id || li.labor_id, JSON.stringify(li)).toBeTruthy();
        expect(li.description, JSON.stringify(li)).toBeTruthy();
        expect(['equipment', 'labor']).toContain(li.line_item_type);
      }
      // every spec'd item can be priced
      const priced = priceLineItems(r.lineItems, sampleRefData, { pricingStructure: 'standard', pricingEffectiveDate: '2026-10-07' });
      expect(priced.ok).toBe(true);
      if (priced.ok) expect(priced.errors, JSON.stringify(priced.errors)).toEqual([]);
    });
  }
});

describe('specSystemDetails - HVAC rules', () => {
  const r = ok(sampleSystemInputs.hvacDuctedTwoAhu);

  it('condenser + install labor + stand/pad, AHUs + install labor + additional equipment', () => {
    expect(ofEquip(r, 380)).toHaveLength(1);
    expect(r.lineItems.filter((li) => li.labor_id === 19 && li.equipment_id === 380)).toHaveLength(1);
    expect(ofEquip(r, 38)).toHaveLength(1); // stand (additional_equipment_ids of 380)
    expect(ofEquip(r, 13)).toHaveLength(1); // pad (additional of the stand, recursive)
    expect(ofEquip(r, 431)).toHaveLength(1);
    expect(ofEquip(r, 430)).toHaveLength(1);
    expect(ofLabor(r, 20)).toHaveLength(2);
    expect(ofEquip(r, 203)).toHaveLength(2); // lineset per AHU
  });
  it('performance guarantee, multi-AHU discount once, thermostats, GFI circuits', () => {
    expect(ofLabor(r, 90)).toHaveLength(1);
    expect(ofLabor(r, 90)[0].show_in_proposal).toBe(true);
    expect(ofLabor(r, 88)).toHaveLength(1); // second non-furnace AHU only
    expect(ofEquip(r, 173)).toHaveLength(2);
    expect(ofLabor(r, 50)).toHaveLength(2);
    expect(ofLabor(r, 50)[0].additional_data?.electrical?.termination).toBe('GFI Outlet');
  });
  it('2 M-series AHUs on an SM condenser -> one branch box, refrigerant adder, 45A condenser circuit (labor 58)', () => {
    expect(ofEquip(r, 384)).toHaveLength(1); // PAC-LMA30BC (R-454B 3-port)
    expect(ofEquip(r, 528)).toHaveLength(1); // 'Refrigerant Adder' (<=3 IDU) R-454B
    const c = r.lineItems.find((li) => li.labor_id === 58 && li.equipment_id === 380);
    expect(c).toBeTruthy(); // item_count(Branch Box) = 1 condition wins over 'none' (40A)
    expect(c!.additional_data?.electrical?.circuit_length).toBe(5);
    expect(r.lineItems.some((li) => li.labor_id === 3 && li.equipment_id === 380)).toBe(false);
  });
  it('electrical requirement falls through to the 40A condition without a branch box (labor 3)', () => {
    const single = ok(
      makeSystemInput({
        laborWarranty: null,
        heatPump: {
          condenser: { model: 380, location: 'x', electrical: { circuitLength: 12 }, serviceOutlet: { enabled: false } },
          miniSplit: { count: 1, units: [{ model: { id: 326 }, location: 'a', thermostat: { accessory: { id: null } } }] },
        },
      }),
    );
    const c = single.lineItems.find((li) => li.labor_id === 3 && li.equipment_id === 380);
    expect(c?.additional_data?.electrical?.circuit_length).toBe(12);
  });
  it('ducted system -> commissioning kit 563 and ducted AHRI record', () => {
    expect(ofEquip(r, 563)).toHaveLength(1);
    expect(r.ahriRecord?.certification_type_detail).toBe('ducted');
    expect(r.newSystem.ahri_id).toBe(r.ahriRecord!.id);
    expect(r.ahriRecord!.fuzzy_child_id_opt).toBe('SVZ-%'); // most specific (rank 3) wins
  });
  it('whole-home surge after the cutoff date; fuel = heat pump', () => {
    expect(ofLabor(r, 122)).toHaveLength(1);
    expect(r.newSystem.system_type_detail.fuel).toBe('heat pump');
    expect(r.newSystem.system_status).toBe('proposed');
  });
  it('no surge before the cutoff date', () => {
    const early = ok({ ...sampleSystemInputs.hvacDuctedTwoAhu, PricingEffectiveDate: '2025-10-28' });
    expect(ofLabor(early, 122)).toHaveLength(0);
    const edge = ok({ ...sampleSystemInputs.hvacDuctedTwoAhu, PricingEffectiveDate: '2025-10-29' });
    expect(ofLabor(edge, 122)).toHaveLength(1);
  });

  it('6 M-series heads on an SM R-454B condenser: 2x 3-port branch box + tee + refrigerant adder (>3 IDU)', () => {
    const six = ok(sampleSystemInputs.hvacMiniSplitSixHeads);
    const bb = ofEquip(six, 384);
    expect(bb).toHaveLength(2);
    expect(bb[0].additional_data?.electrical).toMatchObject({ circuit_length: 30, difficult: false });
    expect(bb[1].additional_data?.electrical).toMatchObject({ circuit_length: 45, difficult: true });
    expect(ofEquip(six, 525)).toHaveLength(1); // MSDD-50AR2-E tee for R-454B
    expect(ofEquip(six, 529)).toHaveLength(1); // 'Refrigerant Adder >3 IDU' R-454B
    expect(ofEquip(six, 527)).toHaveLength(0);
    // two branch boxes: the "exactly one branch box" 45A condition does not match -> 40A (labor 3)
    expect(six.lineItems.some((li) => li.labor_id === 3 && li.equipment_id === 380)).toBe(true);
    expect(six.lineItems.some((li) => li.labor_id === 58 && li.equipment_id === 380)).toBe(false);
    expect(six.ahriRecord?.certification_type_detail).toBe('ductless');
    expect(ofLabor(six, 30)).toHaveLength(1); // complicated MS adder
  });
  it('<=3 heads -> one 3-port box, 4-5 -> 5-port', () => {
    const mk = (n: number) =>
      ok(
        makeSystemInput({
          laborWarranty: null,
          heatPump: {
            condenser: { model: 380, location: 'x', electrical: { circuitLength: 5, difficult: false, treehouseScoped: false }, serviceOutlet: { enabled: false } },
            miniSplit: { count: n, units: [326, 329, 332, 335, 327].slice(0, n).map((id) => ({ model: { id }, location: 'a', thermostat: { accessory: { id: null } } })) },
          },
        }),
      );
    expect(ofEquip(mk(3), 384)).toHaveLength(1);
    expect(ofEquip(mk(3), 385)).toHaveLength(0);
    expect(ofEquip(mk(5), 385)).toHaveLength(1);
    expect(ofEquip(mk(1), 384)).toHaveLength(0);
  });
  it('manual branch box override skips automatic boxes; advanced calculatedBoxes are added', () => {
    const base = sampleSystemInputs.hvacMiniSplitSixHeads;
    const manual = ok({
      ...base,
      heatPump: {
        ...base.heatPump,
        branchBoxes: {
          outside: { enabled: false, count: 0 },
          advanced: {
            enabled: true,
            isManualOverride: true,
            calculatedBoxes: [{ id: 'bb-1', name: 'Box 1', model: 'PAC-LMA50BC', type: 'branch_box', assignedUnits: [1, 2], maxCapacity: 5, remainingCapacity: 3, refrigerant: 'R-454B' }],
          },
        },
      },
    });
    expect(ofEquip(manual, 384)).toHaveLength(0);
    const added = ofEquip(manual, 385);
    expect(added).toHaveLength(1);
    expect(added[0].additional_data).toMatchObject({ branchBoxId: 'bb-1', isManual: true, capacity: { max: 5, used: 2, remaining: 3 } });
  });
  it('S-series heads on an SM condenser use branch joints (CMY-Y6x)', () => {
    // no S-series heads exist in the sample catalog: use two PVFY (S) AHUs via specEquipment directly
    const res = specEquipment(
      [{ equipment_id: 101 }, { equipment_id: 53 }, { equipment_id: 59 }],
      sampleRefData,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lineItems.some((li) => li.equipment_id === 67)).toBe(true); // CMY-Y62-G-E (2 indoor units)
  });

  it('downflow: SVZ kit by tonnage, PVA -> CMA-1, PVFY -> none; unknown series throws', () => {
    const mk = (id: number) =>
      specSystemDetails(
        makeSystemInput({
          laborWarranty: null,
          heatPump: { condenser: { model: 380, location: 'x', electrical: { circuitLength: 5 }, serviceOutlet: { enabled: false } }, ahu: { count: 1, units: [ahuUnit(id, { configuration: { downflow: true } })] } },
        }),
        sampleRefData,
      );
    const svz30 = mk(431); // SVZ-AP30NL -> mbh 30 -> DFK-M (316)
    expect(svz30.ok && svz30.lineItems.some((li) => li.equipment_id === 316)).toBe(true);
    const svz18 = mk(429);
    expect(svz18.ok && svz18.lineItems.some((li) => li.equipment_id === 317)).toBe(true);
    const pva = mk(404);
    expect(pva.ok && pva.lineItems.some((li) => li.equipment_id === 11)).toBe(true);
    const pvfy = mk(53);
    expect(pvfy.ok && pvfy.lineItems.some((li) => [11, 316, 317].includes(li.equipment_id as number))).toBe(false);
    const bosch = mk(468);
    expect(bosch.ok).toBe(false);
    if (!bosch.ok) expect(bosch.errors[0].message).toMatch(/no downflow kit rule exists/);
  });

  it('dual fuel: furnace + dual-fuel coil', () => {
    const d = ok(sampleSystemInputs.hvacDualFuel);
    expect(d.newSystem.system_type_detail).toEqual({ fuel: 'dual fuel', switchover_temp: 25 });
    expect(d.ahriRecord?.fuzzy_furnace_id_opt).toBe('BGH%');
    expect(ofLabor(d, 119)).toHaveLength(1); // PVC venting: non-condensing existing furnace
    const bad = specSystemDetails(
      makeSystemInput({ laborWarranty: null, heatPump: { condenser: { model: 72, electrical: { circuitLength: 5 }, serviceOutlet: { enabled: false } }, ahu: { count: 1, units: [ahuUnit(484)] } } }),
      sampleRefData,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toBe('A furnace must be paired with a dual-fuel coil');
  });

  it('single-circuit surge: one device per 240V circuit', () => {
    const six = ok(sampleSystemInputs.hvacMiniSplitSixHeads);
    const circuits240 = six.lineItems.filter((li) => {
      const l = li.labor_id ? sampleRefData.labor.find((x) => x.id === li.labor_id) : undefined;
      return l?.subcategory === 'circuit' && l.circuit_voltage === 240;
    });
    expect(circuits240.length).toBeGreaterThan(0);
    expect(ofLabor(six, 121)).toHaveLength(circuits240.length);
  });

  it('fails with a typed error when no AHRI record matches', () => {
    const r = specSystemDetails(sampleSystemInputs.hvacDuctedTwoAhu, { ...sampleRefData, ahri: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toBe('No AHRI record found for system as specified');
  });
  it('fails when a required catalog lookup is missing', () => {
    const r = specSystemDetails(sampleSystemInputs.hvacDuctedTwoAhu, { ...sampleRefData, labor: sampleRefData.labor.filter((l) => l.id !== 88) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/catalog lookup failed for .*multiAhuDiscount_id/);
  });
  it('rejects an unknown mode', () => {
    const r = specSystemDetails({ ...sampleSystemInputs.adder, mode: 'add_system' as any }, sampleRefData);
    expect(r.ok).toBe(false);
  });
});

describe('specSystemDetails - other system types', () => {
  it('water heater: HPWH + expansion tank + drain pan + TMV + location adder + GFI + AHRI(water heater)', () => {
    const r = ok(sampleSystemInputs.waterHeater);
    expect(ofEquip(r, 155)).toHaveLength(1);
    expect(ofLabor(r, 47)).toHaveLength(1); // HPWH 50 gal install labor
    for (const id of [17, 18, 16, 14, 50]) expect(ofLabor(r, id).length, `labor ${id}`).toBeGreaterThanOrEqual(1);
    expect(ofLabor(r, 122)).toHaveLength(1);
    expect(r.ahriRecord?.certification_type).toBe('water heater');
    expect(r.newSystem.ahri_id).toBe(r.ahriRecord!.id);
    expect(r.newSystem.system_type_detail.fuel).toBe('heat pump');
  });
  it('ev: charger with circuit; circuit-only variant uses the 50A circuit', () => {
    const r = ok(sampleSystemInputs.ev);
    expect(ofEquip(r, 117)).toHaveLength(1);
    expect(r.lineItems.find((li) => li.labor_id === 52)).toBeTruthy(); // install labor
    expect(r.newSystem.system_type_detail.fuel).toBe('electric');
    const c = ok(sampleSystemInputs.evCircuitOnly);
    expect(c.lineItems).toHaveLength(1);
    expect(c.lineItems[0].labor_id).toBe(4);
    expect(c.lineItems[0].additional_data?.electrical?.termination).toBe('Plug');
  });
  it('energy efficiency: quantities and square footage on the system', () => {
    const r = ok(sampleSystemInputs.energyEfficiency);
    expect(r.lineItems.find((li) => li.labor_id === 38)?.quantity).toBe(900);
    expect(r.lineItems.find((li) => li.labor_id === 40)?.quantity).toBe(1);
    expect(r.newSystem.additional_data.energyEfficiency).toEqual({ atticInsulation_sqft: 900 });
  });
  it('panel / cooktop / adder quick-adds', () => {
    const panel = ok(sampleSystemInputs.panel);
    expect(ofLabor(panel, 91)).toHaveLength(1);
    expect(ofEquip(panel, 114)).toHaveLength(1);
    expect(ofLabor(panel, 122)).toHaveLength(1); // surge eligible
    expect(ok(sampleSystemInputs.cooktop).lineItems[0].labor_id).toBe(4);
    expect(ok(sampleSystemInputs.adder).lineItems).toMatchObject([{ labor_id: 42, description: 'Drywall Touch-Up', show_in_proposal: true }]);
  });
  it('change order: status, severity and additional_data', () => {
    const r = ok(sampleSystemInputs.changeOrder);
    expect(r.newSystem.system_status).toBe('proposed - from change order');
    expect(r.newSystem.additional_data).toMatchObject({ description: 'Add duct cleaning', severity: 3, customerConsent: true });
  });
  it('edit mode keeps the supplied status and system id', () => {
    const r = ok(asEditInput(sampleSystemInputs.adder, 4242, 'active'));
    expect(r.newSystem.system_status).toBe('active');
    expect(r.system_id).toBe(4242);
  });
});

describe('labor warranty', () => {
  const counts = [{ proposal_id: 1, fuel_type: 'heat pump', condenser_manufacturer: 'Mitsubishi', condenser_count: 2, ahu_count: 2, minisplit_count: 1 }];
  it('Mitsubishi 5y: base + extra outdoor + extra indoor units', () => {
    const r = ok(sampleSystemInputs.laborWarranty, { warrantyCounts: counts });
    expect(r.lineItems.map((li) => li.labor_id)).toEqual([160, 165, 166, 166]);
    expect(r.lineItems[0].description).toBe('5 Years Extended Heat Pump Labor Warranty');
  });
  it('non-Mitsubishi minisplit-only 2y', () => {
    const r = ok(
      makeSystemInput({ cost_system_type: 'labor warranty', laborWarranty: { warranty: { hp_term: 2 } } }),
      { warrantyCounts: [{ ...counts[0], condenser_manufacturer: 'Bosch', condenser_count: 1, ahu_count: 0, minisplit_count: 3 }] },
    );
    expect(r.lineItems.map((li) => li.labor_id)).toEqual([178, 173, 173]);
  });
  it('water heater warranty and no counts', () => {
    const r = ok(makeSystemInput({ cost_system_type: 'labor warranty', laborWarranty: { warranty: { hpwh_term: 10 } } }));
    expect(r.lineItems.map((li) => li.labor_id)).toEqual([181]);
    expect(ok(makeSystemInput({ cost_system_type: 'labor warranty', laborWarranty: { warranty: { hp_term: 5 } } })).lineItems).toEqual([]);
  });
  it('computeWarrantyCounts mirrors the SQL', () => {
    const rows = computeWarrantyCounts(
      [9919],
      {
        systems: [{ id: 1, house_id: 1, proposal_id: 9919, system_type: 'hvac', system_status: 'proposed', system_type_detail: { fuel: 'heat pump' } }],
        lineItems: [
          { system_id: 1, equipment_id: 380 },
          { system_id: 1, equipment_id: 431 },
          { system_id: 1, equipment_id: 326, status: 'active - from change order' },
          { system_id: 1, labor_id: 19, equipment_id: 380 },
          { system_id: 1, equipment_id: 326, status: 'deleted' },
        ],
      },
      sampleRefData.equipment,
    );
    expect(rows).toEqual([{ proposal_id: 9919, fuel_type: 'heat pump', condenser_manufacturer: 'Mitsubishi', condenser_count: 1, ahu_count: 1, minisplit_count: 1 }]);
  });
});

describe('jurisdiction rules', () => {
  it('MA hvac adds AFCI labor 74; CO/Boulder adds ball valve per mini-split head; inactive rules ignored', () => {
    const ma = ok(sampleSystemInputs.hvacDuctedTwoAhu); // MA house
    expect(ofLabor(ma, 74)).toHaveLength(1);
    expect(ofLabor(ma, 87)).toHaveLength(0);
    const boulder = ok({ ...sampleSystemInputs.hvacMiniSplitSixHeads, specIncentives: { proposal_id: [1], house: { ...sampleHouses.co, city: ' boulder ' } } });
    expect(ofLabor(boulder, 140)).toHaveLength(6);
    expect(ofLabor(ok(sampleSystemInputs.hvacMiniSplitSixHeads), 140)).toHaveLength(0); // Broomfield
  });
});

describe('specEquipment (standalone)', () => {
  it('rejects an empty list and unknown electrical conditions', () => {
    expect(specEquipment([], sampleRefData).ok).toBe(false);
    const bad = {
      ...sampleRefData,
      equipment: sampleRefData.equipment.map((e) => (e.id === 380 ? { ...e, electrical_requirements: [{ condition_type: 'bogus', circuits: [] }] } : e)),
    };
    const r = specEquipment([{ equipment_id: 380 }], bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/invalid electrical condition/);
  });
  it('does not mutate its input', () => {
    const items: LineItem[] = [{ equipment_id: 380, additional_data: { electrical: { circuit_length: 5 } } }];
    const copy = JSON.parse(JSON.stringify(items));
    specEquipment(items, sampleRefData);
    expect(items).toEqual(copy);
  });
});

describe('ahri / sql helpers', () => {
  it('sqlLike', () => {
    expect(sqlLike('MXZ-SM42NLHZ', 'MXZ-SM42%')).toBe(true);
    expect(sqlLike('MXZ-SM42NLHZ', '%NLHZ')).toBe(true);
    expect(sqlLike('abc', 'a_c')).toBe(true);
    expect(sqlLike('abc', 'A%')).toBe(false); // case sensitive
    expect(sqlLike('a.c', 'a.c')).toBe(true);
    expect(sqlLike('abc', 'a.c')).toBe(false);
    expect(sqlLike(null, '%')).toBe(false);
    expect(sqlLike('x', null)).toBe(false);
    expect(sqlLike('50%', '50\\%')).toBe(true);
  });
  it('findAhriRecord ranks by specificity and strips .TH from the condenser model', () => {
    const rows = [
      { id: 1, fuzzy_parent_id_opt: 'SUZ-KA09NAHZ%', fuzzy_child_id_opt: '%', fuzzy_furnace_id_opt: null, child_equipment_id: null, furnace_id: null, certification_type_detail: 'ductless', specificity_rank_opt: 1 },
      { id: 2, fuzzy_parent_id_opt: 'SUZ-KA09NAHZ%', fuzzy_child_id_opt: 'MSZ-%', fuzzy_furnace_id_opt: null, child_equipment_id: null, furnace_id: null, certification_type_detail: 'ductless', specificity_rank_opt: 9 },
    ];
    const q = { condenserModel: 'SUZ-KA09NAHZ.TH', indoorModel: 'MSZ-FS09NA', systemDuctingType: 'ductless' as const, furnaceModel: null, coilModel: null, waterHeaterModel: null };
    expect(findAhriRecord(rows, q)?.id).toBe(2);
    expect(findAhriRecord(rows, { ...q, systemDuctingType: 'ducted' })).toBeNull();
    expect(findAhriRecord(rows, { ...q, systemDuctingType: null })).toBeNull();
  });
});

describe('specAndPriceSystem (whole workflow)', () => {
  const ctx = { now: '2026-11-10T12:00:00Z' };
  it('parses proposal ids vs new proposal names', () => {
    expect(parseProposals([1, '2', 'Option B', 'x1'])).toEqual({ existingIds: [1, 2], newProposalNames: ['Option B', 'x1'] });
  });

  it('specs, prices and fans out to one result per proposal; new proposals are described as writes', () => {
    const input: SystemInput = { ...sampleSystemInputs.hvacDuctedTwoAhu, specIncentives: { ...sampleSystemInputs.hvacDuctedTwoAhu.specIncentives, proposal_id: [9919, 'Option B'] } };
    const r = specAndPriceSystem(input, sampleRefData, { ...ctx, newProposalIds: { 'Option B': 777 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposals.map((p) => p.proposal_id)).toEqual([9919, 777]);
    expect(r.newProposals).toHaveLength(1);
    expect(r.newProposals[0].proposal).toMatchObject({ nickname: 'Option B', proposal_status: 'pending', house_id: 147, proposal_created_at: '2026-11-10T12:00:00.000Z' });
    for (const p of r.proposals) {
      expect(p.status).toBe('success');
      expect(p.system.proposal_id).toBe(p.proposal_id);
      const total = p.lineItems.reduce((s, li) => s + Number(li.price_actual), 0);
      expect(total).toBeGreaterThan(10000);
      for (const li of p.lineItems) expect(Number.isFinite(Number(li.price_actual)), JSON.stringify(li)).toBe(true);
    }
  });

  it('removes whole-home surge when the proposal already has one (checkExistingSurge)', () => {
    const input = sampleSystemInputs.hvacDuctedTwoAhu; // surge 'Whole Home', proposal 9919
    const existing = { systems: [{ id: 1, house_id: 147, proposal_id: 9919, system_type: 'panel' }], lineItems: [{ system_id: 1, labor_id: 122 }] };
    expect(computeSurgeCounts([9919], existing, 'add system')).toEqual([{ proposal_id: 9919, count: 1 }]);
    expect(computeSurgeCounts([9919], existing, 'edit system', 1)).toEqual([]);
    const withSurge = specAndPriceSystem(input, sampleRefData, ctx);
    const without = specAndPriceSystem(input, sampleRefData, { ...ctx, existing });
    if (!withSurge.ok || !without.ok) throw new Error('not ok');
    expect(withSurge.proposals[0].lineItems.some((li) => li.labor_id === 122)).toBe(true);
    expect(without.proposals[0].lineItems.some((li) => li.labor_id === 122)).toBe(false);
  });

  it('edit mode re-attaches manually added line items', () => {
    const manual = [{ id: 55, system_id: 1, labor_id: 42, manually_added: true, price_actual: 250 }];
    const r = specAndPriceSystem(asEditInput(sampleSystemInputs.adder, 1), sampleRefData, { ...ctx, manualLineItems: manual });
    if (!r.ok) throw new Error('not ok');
    const last = r.proposals[0].lineItems.at(-1)!;
    expect(last).toMatchObject({ id: 55, temp_id: 55, fetchedFromDb: true });
  });

  it('pricing errors flag the proposal; spec failures return ok:false', () => {
    const noPrices = specAndPriceSystem(sampleSystemInputs.hvacDuctedTwoAhu, { ...sampleRefData, prices: sampleRefData.prices.filter((p) => p.equipment_id !== 431) }, ctx);
    if (!noPrices.ok) throw new Error('not ok');
    expect(noPrices.proposals[0].status).toBe('error');
    expect(noPrices.proposals[0].errors[0].message).toMatch(/No price found for equipment id 431/);
    const failed = specAndPriceSystem(sampleSystemInputs.hvacDuctedTwoAhu, { ...sampleRefData, ahri: [] }, ctx);
    expect(failed.ok).toBe(false);
  });

  it('uses the incentives provider seam', () => {
    const r = specAndPriceSystem(sampleSystemInputs.adder, sampleRefData, {
      ...ctx,
      incentives: ({ lineItems }) => ({ result: [...lineItems, { line_item_type: 'incentive', incentive_id: 19, price_actual: -500, description: 'Test incentive' }] }),
    });
    if (!r.ok) throw new Error('not ok');
    expect(r.proposals[0].lineItems.at(-1)).toMatchObject({ incentive_id: 19, price_actual: -500 });
  });
});
