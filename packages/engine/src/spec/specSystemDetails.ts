import type {
  AhriCertification,
  Equipment,
  Labor,
  LineItem,
  NewSystem,
  RefData,
  SpecContext,
  SpecSystemDetailsResult,
  SystemInput,
} from '../types';
import { getNestedValue, indexById, toEngineError } from '../util';
import { getHvacSystemType } from '../pricing/hvacSystemType';
import { findAhriRecord } from './ahri';
import { getIndoorUnits, getOutdoorUnit, specEquipmentUnsafe } from './specEquipment';

/** Surge protection is only specced for pricing effective dates on/after this day (UTC). */
export const SURGE_CUTOFF = '2025-10-29';

type RequiredIds = Record<string, number | undefined>;

/** Catalog lookups by model number / labor name (`mapRequiredIds` in the original). */
export function mapRequiredIds(equipmentData: Record<number, Equipment>, laborData: Record<number, Labor>): RequiredIds {
  const ids: RequiredIds = {};
  const equipmentArray = Object.values(equipmentData);
  const laborArray = Object.values(laborData);

  const equipmentMap: Record<string, string> = {
    cn24_id: 'CN24RELAY-KIT-CM3',
    bbEnclosure_id: 'BBE-1',
    aidoo_id: 'AZAI6WSCMEL',
    aidoo_pro_id: 'AZAI6WSPMEL',
    cn105_splitter_id: 'AZX6ACCSPLMEL',
    cma_1_id: 'CMA-1',
    dfk_m_id: 'DFK-M',
    dfk_s_id: 'DFK-S',
  };
  for (const key in equipmentMap) {
    const found = equipmentArray.find((item) => item.model_number === equipmentMap[key]);
    if (found) ids[key] = found.id;
  }

  const laborNameMap: Record<string, string> = {
    pumpHpLabor_id: 'Condensate Pump for Heat Pump',
    pumpHpwhLabor_id: 'Condensate Pump for HPWH',
    tmvLabor_id: 'Thermostatic Mixing Valve (Caleffi 521516AC/520516A, Taco 5004-H3-G)',
    expansionTankLabor_id: 'Expansion Tank (Amtrol, Proflow, Zurn, Wilkins)',
    drainPanLabor_id: 'Drain Pan',
    atticAdder_id: 'Crawlspace or Attic Adder - Hard',
    crawlAdder_id: 'Crawlspace or Attic Adder - Hard',
    eeAudit_id: 'Energy Audit',
    eeAtticInsulation_id: 'Attic insulation',
    eeAtticSealing_id: 'Attic floor sealing',
    eeAirSealing_id: 'Blower door directed air sealing',
    eeAeroseal_id: 'Aeroseal (Supply Ductwork)',
    eeBlowerTest_id: 'Pre/Post Install Testing',
    eeCrawlspace_id: 'Crawlspace insulation',
    eeVaporGuard_id: 'Vapor guard',
    thermWire_id: 'Thermostat Wiring',
  };
  for (const key in laborNameMap) {
    const found = laborArray.find((item) => item.name === laborNameMap[key]);
    if (found) ids[key] = found.id;
  }

  const laborIncludesMap: Record<string, string> = {
    hp_guarantee_id: 'Performance Guarantee',
    hpwhLocationAdder_id: 'HPWH Different Location',
    hpwhDifficultyAdder_id: 'HPWH Difficulty',
    msAdder_id: 'Complicated MS',
    ahuAdder_id: 'Complicated AHU',
    multiAhuDiscount_id: 'Multiple AHU Discount',
  };
  for (const key in laborIncludesMap) {
    const found = laborArray.find((item) => item.name.includes(laborIncludesMap[key]));
    if (found) ids[key] = found.id;
  }

  const warrantyLaborIds = [159, 160, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 173, 175, 177, 178, 179, 180];
  warrantyLaborIds.forEach((id) => {
    if (laborData[id]) ids['labor_' + id] = id;
  });

  const gfiCircuit = laborArray.find((l) => l.circuit_voltage === 120 && l.circuit_amps === 20);
  if (gfiCircuit) ids.gfiCircuit_id = gfiCircuit.id;
  const circuit50A = laborArray.find((l) => l.circuit_voltage === 240 && l.circuit_amps === 50);
  if (circuit50A) ids.circuit50A_id = circuit50A.id;
  return ids;
}

const REQUIRED_IDS_BY_TYPE: Record<string, string[]> = {
  hvac: [
    'cn24_id', 'bbEnclosure_id', 'aidoo_id', 'aidoo_pro_id', 'cn105_splitter_id', 'cma_1_id', 'dfk_m_id',
    'dfk_s_id', 'pumpHpLabor_id', 'thermWire_id', 'hp_guarantee_id', 'atticAdder_id', 'crawlAdder_id',
    'msAdder_id', 'ahuAdder_id', 'multiAhuDiscount_id', 'gfiCircuit_id',
  ],
  'water heater': ['pumpHpwhLabor_id', 'tmvLabor_id', 'expansionTankLabor_id', 'drainPanLabor_id', 'hpwhLocationAdder_id', 'hpwhDifficultyAdder_id', 'gfiCircuit_id'],
  'energy efficiency': ['eeAudit_id', 'eeAtticInsulation_id', 'eeAtticSealing_id', 'eeAirSealing_id', 'eeAeroseal_id', 'eeBlowerTest_id', 'eeCrawlspace_id', 'eeVaporGuard_id'],
  ev: ['circuit50A_id'],
  cooktop: [],
  panel: [],
  adder: [],
  'labor warranty': [],
};

/** The jurisdiction rules' criterion operators (`evaluateCriterion`). */
export function evaluateCriterion(actualValue: any, condition: { operator: string; value?: any }): boolean {
  switch (condition.operator) {
    case 'exists':
      return actualValue !== undefined && actualValue !== null && actualValue !== false && actualValue !== '';
    case '>':
      return Number(actualValue) > Number(condition.value);
    case '<':
      return Number(actualValue) < Number(condition.value);
    case '>=':
      return Number(actualValue) >= Number(condition.value);
    case '<=':
      return Number(actualValue) <= Number(condition.value);
    case '===':
    case '==':
      return actualValue === condition.value;
    case 'contains_any':
      if (!Array.isArray(actualValue)) return false;
      return (condition.value as any[]).some((val) => actualValue.includes(val));
    default:
      return false;
  }
}

/**
 * Port of the `specSystemDetails` block (add / edit a system).
 *
 * Turns the add/edit-system modal payload into
 *  - `newSystem` (the systems_new row to insert/update: type, status, fuel, switchover temp, target margin, ahri_id...), and
 *  - `lineItems`: UN-PRICED line items (equipment + install labor + circuits + adders + warranty + surge ...).
 * Pipeline: gather by `cost_system_type` -> jurisdiction rules -> specEquipment (branch boxes, circuits) ->
 * advanced branch-box assignment -> surge protection -> AHRI lookup (hvac/water heater).
 *
 * Every `throw new Error` of the original (missing catalog ids, "A furnace must be paired with a dual-fuel coil",
 * "No AHRI record found for system as specified", downflow kit rules, ...) is returned as `{ ok:false, errors }`.
 *
 * Data the workflow read from the DB is passed in: equipment/labor/jurisdiction/ahri from `refData`,
 * warranty counts and (edit mode) manual line items through `ctx`.
 */
export function specSystemDetails(
  input: SystemInput,
  refData: Pick<RefData, 'equipment' | 'labor' | 'jurisdictionRules' | 'ahri'>,
  ctx: SpecContext = {},
): SpecSystemDetailsResult {
  try {
    return specSystemDetailsUnsafe(input, refData, ctx);
  } catch (e) {
    return { ok: false, errors: [toEngineError(e)] };
  }
}

export function specSystemDetailsUnsafe(
  input: SystemInput,
  refData: Pick<RefData, 'equipment' | 'labor' | 'jurisdictionRules' | 'ahri'>,
  ctx: SpecContext = {},
): SpecSystemDetailsResult {
  const t: any = input;
  const isChangeOrder = t.state === 'CO';

  if (t.mode !== 'add system' && t.mode !== 'edit system') {
    throw new Error('specSystemDetails: unrecognised mode ' + JSON.stringify(t.mode));
  }

  const newSystem: any = {
    system_type: t.cost_system_type,
    system_status: t.mode === 'add system' ? (isChangeOrder ? 'proposed - from change order' : 'proposed') : t.system_status,
    house_id: t.specIncentives.house.id,
    system_type_detail: {},
    target_margin: t.targetMargin,
    rebate_eligibility_type: t.rebateEligibilityType,
    rebate_effective_date: t.rebateEffectiveDate,
    heating_load_coverage: t.heatLoadCoverage,
  };

  if (isChangeOrder) {
    newSystem.additional_data = {
      description: t.description,
      reason: t.reason,
      requester: t.requester,
      timeline: t.timeline,
      impact: t.impact,
      respParty: t.respParty,
      customerConsent: t.customerConsent,
      installerConsent: t.installerConsent,
      severity: Math.max(Number(t.timeline) || 0, Number(t.impact) || 0),
    };
  }
  if (!newSystem.additional_data) newSystem.additional_data = {};
  newSystem.additional_data.energyEfficiency = {};

  const errors: any[] = [];
  const equipmentData: Record<number, Equipment> = indexById(refData.equipment);
  const laborList: Labor[] = t.laborData ?? refData.labor;
  const laborData: Record<number, Labor> = indexById(laborList);
  let ahriRecord: AhriCertification | null = null;

  const requiredIds = mapRequiredIds(equipmentData, laborData);

  /* ---------------- gatherModalData ---------------- */
  const lineItems: LineItem[] = [];

  function gatherLaborWarrantyData() {
    const lwData = t.laborWarranty || {};
    const hpTerm = Number(lwData.warranty?.hp_term);
    const hpwhTerm = Number(lwData.warranty?.hpwh_term);

    const queryRows = ctx.warrantyCounts || [];
    const countsRecord: any = Array.isArray(queryRows) ? queryRows[0] : queryRows;

    const pushLabor = (laborId: number, customDescription?: string) => {
      if (laborId) {
        const laborItem = laborData[laborId];
        lineItems.push({
          labor_id: laborId,
          line_item_type: 'labor',
          description: customDescription || (laborItem ? laborItem.name : undefined),
        });
      }
    };
    const pushN = (n: number, id: number, d: string) => {
      for (let i = 0; i < n; i++) pushLabor(id, d);
    };

    // 1. HVAC systems (heat pump)
    if (hpTerm) {
      const manufacturer = countsRecord?.condenser_manufacturer || lwData.manufacturer || '';
      const condenserCount = Number(countsRecord?.condenser_count || 0);
      const ahuCount = Number(countsRecord?.ahu_count || 0);
      const minisplitCount = Number(countsRecord?.minisplit_count || 0);
      const fuel = countsRecord?.fuel_type || '';
      const d = `${hpTerm} Years Extended Heat Pump Labor Warranty`;

      if (manufacturer === 'Mitsubishi' && fuel !== 'dual fuel') {
        const tiers: Record<number, [number, number, number]> = { 2: [159, 163, 164], 5: [160, 165, 166], 12: [162, 167, 168] };
        const tier = tiers[hpTerm];
        if (tier) {
          pushLabor(tier[0], d);
          if (condenserCount > 1) pushN(condenserCount - 1, tier[1], d);
          const totalIndoor = ahuCount + minisplitCount;
          if (totalIndoor > 1) pushN(totalIndoor - 1, tier[2], d);
        }
      } else if (manufacturer !== 'Mitsubishi' || fuel === 'dual fuel') {
        const tiers: Record<number, [number, number, number]> = { 2: [169, 178, 173], 5: [170, 179, 175], 10: [171, 180, 177] };
        const tier = tiers[hpTerm];
        if (tier) {
          if (condenserCount === 1 && ahuCount === 1 && minisplitCount === 0) pushLabor(tier[0], d);
          if (condenserCount === 1 && ahuCount === 0 && minisplitCount >= 1) pushLabor(tier[1], d);
          if (minisplitCount > 1) pushN(minisplitCount - 1, tier[2], d);
        }
      }
    }

    // 2. Water heater (HPWH)
    if (hpwhTerm) {
      const waterHeaterCount = Number(countsRecord?.water_heater_count || countsRecord?.hpwh_count || 1);
      pushN(waterHeaterCount, 181, '10 Years Extended Heat Pump Water Heater Labor Warranty');
    }
  }

  function gatherHeatPumpData() {
    newSystem.system_type_detail.fuel = 'heat pump';

    if (t.heatPump.condenser.model !== null) {
      lineItems.push({
        equipment_id: t.heatPump.condenser.model,
        location: t.heatPump.condenser.location,
        additional_data: {
          electrical: {
            circuit_length: t.heatPump.condenser.electrical.circuitLength,
            difficult: t.heatPump.condenser.electrical.difficult,
            treehouse_scoped: t.heatPump.condenser.electrical.treehouseScoped,
          },
        },
      });
    }

    lineItems.push({ labor_id: requiredIds.hp_guarantee_id, show_in_proposal: true });

    if (t.heatPump.controls.integrated.enabled) {
      lineItems.push({ equipment_id: t.heatPump.controls.integrated.model });
    }

    if (t.heatPump.controls.wiresNeeded > 0) {
      for (let i = 0; i < t.heatPump.controls.wiresNeeded; i++) lineItems.push({ labor_id: requiredIds.thermWire_id });
    }

    if (t.heatPump?.kumoSetup?.spec && t.heatPump.ahu.count > 0) {
      for (let i = 0; i < t.heatPump.ahu.count; i++) lineItems.push({ equipment_id: 33, line_item_type: 'equipment' });
    }

    if (t.heatPump?.kumoSetup?.spec && t.heatPump?.kumoSetup?.indoorUnitCount === 1) {
      lineItems.push({ labor_id: 124, line_item_type: 'labor' });
    } else if (t.heatPump?.kumoSetup?.spec && t.heatPump?.kumoSetup?.indoorUnitCount > 1) {
      lineItems.push({ labor_id: 125, line_item_type: 'labor' });
    }

    if (t.heatPump.condenser.serviceOutlet.enabled) {
      lineItems.push({
        labor_id: requiredIds.gfiCircuit_id,
        additional_data: {
          electrical: {
            circuit_length: t.heatPump.condenser.electrical.circuitLength,
            difficult: t.heatPump.condenser.electrical.difficult,
            termination: 'GFI Outlet',
          },
        },
      });
    }

    let hasFurnace = false;
    let hasDualFuelCoil = false;

    if (t.heatPump && t.heatPump.ahu && t.heatPump.ahu.units) {
      hasFurnace = t.heatPump.ahu.units.some((u: any) => {
        const eq = equipmentData[u.model?.id];
        return eq && eq.equipment_type && eq.equipment_type.toLowerCase().includes('furnace');
      });
      hasDualFuelCoil = t.heatPump.ahu.units.some((u: any) => {
        const eq = equipmentData[u.model?.id];
        return eq && eq.equipment_type && eq.equipment_type === 'Dual-Fuel Coil';
      });
    }

    let eligibleAhuCount = 0;
    let pvcVentingAlreadyAdded = false;

    const ahuUnits: any[] = t.heatPump && t.heatPump.ahu && Array.isArray(t.heatPump.ahu.units) ? t.heatPump.ahu.units : [];
    ahuUnits.forEach((unit, key) => {
      if (unit && unit.model && unit.model.id !== null && unit.model.id !== undefined) {
        const equipment = equipmentData[unit.model.id];
        if (!equipment) {
          throw new Error('specSystemDetails: no equipment row for AHU id ' + unit.model.id + ' at zone ' + key);
        }
        const equipmentType = equipment.equipment_type;
        const isFurnaceOrCoil = equipmentType === 'furnace' || equipmentType === 'Dual-Fuel Coil';

        if (equipmentType === 'furnace') hasFurnace = true;
        if (equipmentType === 'Dual-Fuel Coil') hasDualFuelCoil = true;

        lineItems.push({
          equipment_id: unit.model.id,
          location: unit.location,
          zone_index: key,
          additional_data: {
            electrical: unit.electrical,
            downflowConfiguration: unit.configuration.downflow,
            branchBoxAssignment: unit.branchBoxAssignment || null,
          },
        });

        if (unit.configuration && unit.configuration.downflow && !isFurnaceOrCoil) {
          const mn = String(equipment.model_number || '').trim().toUpperCase();
          const mbhMatch = mn.match(/^SVZ-[A-Z]{2}(\d{2})/);
          const mbh = mbhMatch ? parseInt(mbhMatch[1], 10) : null;
          let downflowKitId: number | null | undefined = null;
          if (mn.indexOf('PVFY') === 0) {
            downflowKitId = null;
          } else if (mn.indexOf('PVA') === 0) {
            downflowKitId = requiredIds.cma_1_id;
          } else if (mn.indexOf('SVZ') === 0) {
            if (mbh === null) {
              throw new Error('Downflow checked on ' + mn + ' but its tonnage could not be read from the model number');
            }
            downflowKitId = mbh >= 30 ? requiredIds.dfk_m_id : requiredIds.dfk_s_id;
          }
          if (downflowKitId) {
            lineItems.push({ equipment_id: downflowKitId, zone_index: key });
          } else if (mn.indexOf('PVFY') !== 0 && mn.indexOf('SVZ') !== 0) {
            throw new Error('Downflow checked on ' + mn + ' but no downflow kit rule exists for that series');
          }
        }

        if (unit.heatKit.id !== null && unit.heatKit.enabled) {
          lineItems.push({
            equipment_id: unit.heatKit.id,
            zone_index: key,
            additional_data: { electrical: unit.electrical, ahuStageTemps: unit.heatKit.stageTemps },
          });
        }

        if (unit.location === 'Attic') lineItems.push({ labor_id: requiredIds.atticAdder_id });
        else if (unit.location === 'Crawlspace') lineItems.push({ labor_id: requiredIds.crawlAdder_id });

        const hideThermostat = equipmentType === 'Dual-Fuel Coil' && hasFurnace;

        if (unit.thermostat && unit.thermostat.id !== null && !hideThermostat) {
          const thermostatId = unit.thermostat.id;
          lineItems.push({ equipment_id: thermostatId, zone_index: key });

          if (thermostatId === 170 || thermostatId === 171) {
            const condenserModelId = t.heatPump.condenser.model;
            if (condenserModelId) {
              const condenserEquipment = equipmentData[condenserModelId];
              if (condenserEquipment?.manufacturer === 'Mitsubishi') {
                lineItems.push({ equipment_id: 32, zone_index: key });
              }
            }
          }
        }

        if (unit.thermostat?.accessory?.id != null) {
          lineItems.push({ equipment_id: unit.thermostat.accessory.id, zone_index: key });
        }

        if (unit.humidifier?.id != null && unit.humidifier.enabled) {
          lineItems.push({
            equipment_id: unit.humidifier.id,
            zone_index: key,
            additional_data: { electrical: unit.electrical },
          });
        }

        if (unit.complications.complicated) lineItems.push({ labor_id: requiredIds.ahuAdder_id });
        if (unit.complications.condensatePump.installed) lineItems.push({ labor_id: requiredIds.pumpHpLabor_id });
        if (unit.complications.condensatePump.circuit) {
          lineItems.push({
            labor_id: requiredIds.gfiCircuit_id,
            additional_data: {
              electrical: {
                circuit_length: unit.electrical.circuit_length,
                difficult: unit.electrical.difficult,
                termination: 'GFI Outlet',
              },
            },
          });
        }
        if (unit.complications?.a2lVentilation) lineItems.push({ labor_id: 127, line_item_type: 'labor' });

        if (unit.humidifier.id !== null && unit.thermostat.id !== null && unit.thermostat.model_number === 'MHK2') {
          lineItems.push({ equipment_id: requiredIds.cn24_id });
        }
        if (
          unit.thermostat.model_number === 'MHK2' &&
          (unit.thermostat.accessory.id === requiredIds.aidoo_id || unit.thermostat.accessory.id === requiredIds.aidoo_pro_id)
        ) {
          lineItems.push({ equipment_id: requiredIds.cn105_splitter_id });
        }
        if (unit.pvcVenting === true) {
          pvcVentingAlreadyAdded = true;
          lineItems.push({ labor_id: 119, line_item_type: 'labor', zone_index: key });
        }

        if (!isFurnaceOrCoil) {
          if (eligibleAhuCount > 0) lineItems.push({ labor_id: requiredIds.multiAhuDiscount_id });
          eligibleAhuCount++;
        }
      }
    });

    const existingHeatingInfo = t.existingHVACRead?.[0]?.system_type_detail?.heating;
    if (!pvcVentingAlreadyAdded && hasFurnace && hasDualFuelCoil && existingHeatingInfo?.condensing === 'non-condensing') {
      lineItems.push({ labor_id: 119, line_item_type: 'labor' });
    }

    if (!hasDualFuelCoil && hasFurnace) {
      throw new Error('A furnace must be paired with a dual-fuel coil');
    }

    if (t.heatPump.miniSplit.complications.enabled && t.heatPump.miniSplit.count > 0) {
      lineItems.push({ labor_id: requiredIds.msAdder_id });
    }

    t.heatPump.miniSplit.units.forEach((unit: any, key: number) => {
      if (unit.model.id !== null) {
        lineItems.push({
          equipment_id: unit.model.id,
          zone_index: key,
          location: unit.location,
          additional_data: { branchBoxAssignment: unit.branchBoxAssignment || null },
        });
      }
      if (unit.thermostat.accessory.id !== null) {
        lineItems.push({ equipment_id: unit.thermostat.accessory.id, zone_index: key });
      }
      if (unit.a2lVentilation) lineItems.push({ labor_id: 127, line_item_type: 'labor' });
      if (unit.quiltPanel) {
        lineItems.push({ equipment_id: unit.quiltPanel, line_item_type: 'equipment', zone_index: key });
      }
    });

    if (t.heatPump.branchBoxes.outside.enabled && t.heatPump.branchBoxes.outside.count > 0) {
      for (let i = 0; i < t.heatPump.branchBoxes.outside.count; i++) lineItems.push({ equipment_id: requiredIds.bbEnclosure_id });
    }

    if (t.heatPump.miniSplit.count > 0 || t.heatPump.ahu.units.length > 0) {
      newSystem.system_type_detail.fuel = 'heat pump';
    }

    if (hasFurnace && hasDualFuelCoil) {
      newSystem.system_type_detail.fuel = 'dual fuel';
      const furnaceUnit = t.heatPump.ahu.units.find((u: any) => {
        const eq = equipmentData[u.model?.id];
        return eq && eq.equipment_type && eq.equipment_type.toLowerCase().includes('furnace');
      });
      if (furnaceUnit && furnaceUnit.switchoverTemp != null && furnaceUnit.switchoverTemp !== '') {
        newSystem.system_type_detail.switchover_temp = Number(furnaceUnit.switchoverTemp);
      }
    } else if (hasDualFuelCoil && !hasFurnace) {
      newSystem.system_type_detail.fuel = 'dual fuel';
      const coilUnit = t.heatPump.ahu.units.find((u: any) => {
        const eq = equipmentData[u.model?.id];
        return eq && eq.equipment_type === 'Dual-Fuel Coil';
      });
      if (coilUnit && coilUnit.switchoverTemp != null && coilUnit.switchoverTemp !== '') {
        newSystem.system_type_detail.switchover_temp = Number(coilUnit.switchoverTemp);
      }
    }

    if (t.laborWarranty) gatherLaborWarrantyData();
  }

  function gatherHPWHData() {
    if (t.HPWH.equipment.model !== null) {
      lineItems.push({
        equipment_id: t.HPWH.equipment.model,
        location: t.HPWH.equipment.location,
        additional_data: {
          electrical: {
            circuit_length: t.HPWH.electrical.circuitLength,
            difficult: t.HPWH.electrical.difficult,
            treehouse_scoped: t.HPWH.electrical.treehouseScoped,
          },
        },
      });

      lineItems.push({ labor_id: requiredIds.expansionTankLabor_id });
      lineItems.push({ labor_id: requiredIds.drainPanLabor_id });

      if (t.HPWH.components.locationAdder) lineItems.push({ labor_id: requiredIds.hpwhLocationAdder_id });
      if (t.HPWH.components.complicationAdder) lineItems.push({ labor_id: requiredIds.hpwhDifficultyAdder_id });
      if (t.HPWH.components.condensatePump.installed) lineItems.push({ labor_id: requiredIds.pumpHpwhLabor_id });

      if (t.HPWH.components?.serviceOutlet) {
        lineItems.push({
          labor_id: requiredIds.gfiCircuit_id,
          additional_data: {
            electrical: {
              circuit_length: t.HPWH.electrical.circuitLength,
              difficult: t.HPWH.electrical.difficult,
              termination: 'GFI Outlet',
            },
          },
        });
      }

      if (t.HPWH.components.tmv) lineItems.push({ labor_id: requiredIds.tmvLabor_id });
      if (t.HPWH?.components?.venting) lineItems.push({ labor_id: 126, line_item_type: 'labor' });

      newSystem.system_type_detail.fuel = 'heat pump';
    }
  }

  function gatherEeData() {
    const ee = t.energyEfficiency;
    if (ee.audit.enabled) lineItems.push({ labor_id: requiredIds.eeAudit_id });
    if (ee.airSealing.enabled) lineItems.push({ labor_id: requiredIds.eeAirSealing_id });

    if (ee.atticInsulation.enabled && ee.atticInsulation.squareFeet > 0) {
      lineItems.push({ labor_id: requiredIds.eeAtticInsulation_id, quantity: ee.atticInsulation.squareFeet });
      newSystem.additional_data.energyEfficiency.atticInsulation_sqft = ee.atticInsulation.squareFeet;
    }
    if (ee.atticAirSealing.enabled && ee.atticAirSealing.squareFeet > 0) {
      lineItems.push({ labor_id: requiredIds.eeAtticSealing_id, quantity: ee.atticAirSealing.squareFeet });
      newSystem.additional_data.energyEfficiency.atticAirSealing_sqft = ee.atticAirSealing.squareFeet;
    }
    if (ee.blowerTest.enabled) lineItems.push({ labor_id: requiredIds.eeBlowerTest_id });
    if (ee.crawlspace.enabled && ee.crawlspace.squareFeet > 0) {
      lineItems.push({ labor_id: requiredIds.eeCrawlspace_id, quantity: ee.crawlspace.squareFeet });
      newSystem.additional_data.energyEfficiency.crawlspace_sqft = ee.crawlspace.squareFeet;
    }
    if (ee.aeroseal.enabled && ee.aeroseal.ahuCount > 0) {
      lineItems.push({ labor_id: requiredIds.eeAeroseal_id, quantity: ee.aeroseal.ahuCount });
    }
    if (ee.vaporGuard.enabled && ee.vaporGuard.squareFeet > 0) {
      lineItems.push({ labor_id: requiredIds.eeVaporGuard_id, quantity: ee.vaporGuard.squareFeet });
      newSystem.additional_data.energyEfficiency.vaporGuard_sqft = ee.vaporGuard.squareFeet;
    }
  }

  function gatherEvData() {
    if (t.evCharging.charger.model !== null) {
      lineItems.push({
        equipment_id: t.evCharging.charger.model,
        location: t.evCharging.charger.location,
        additional_data: {
          electrical: {
            circuit_length: t.evCharging.electrical.circuitLength,
            difficult: t.evCharging.electrical.difficult,
            termination: t.evCharging.electrical.plugOrHardwired.value,
            treehouse_scoped: t.evCharging.electrical.treehouseScoped,
          },
        },
      });
      newSystem.system_type_detail.fuel = 'electric';
    } else if (t.evCharging.electrical.plugOrHardwired.value !== null) {
      lineItems.push({
        labor_id: requiredIds.circuit50A_id,
        additional_data: {
          electrical: {
            circuit_length: t.evCharging.electrical.circuitLength,
            difficult: t.evCharging.electrical.difficult,
            termination: t.evCharging.electrical.plugOrHardwired.value,
            treehouse_scoped: t.evCharging.electrical.treehouseScoped,
          },
        },
      });
      newSystem.system_type_detail.fuel = 'electric';
    }
  }

  function gatherIwData() {
    if (t.inductionWiring.labor.id !== null) {
      lineItems.push({
        labor_id: t.inductionWiring.labor.id,
        additional_data: {
          electrical: {
            circuit_length: t.inductionWiring.electrical.circuitLength,
            difficult: t.inductionWiring.electrical.difficult,
            treehouse_scoped: t.inductionWiring.electrical.treehouseScoped,
          },
        },
      });
      newSystem.system_type_detail.fuel = 'electric';
    }
  }

  function gatherElectricalUpgradeData() {
    t.electricalUpgrades.labor.items.forEach((id: number) => {
      lineItems.push({
        labor_id: id,
        additional_data: { electrical: { treehouse_scoped: t.electricalUpgrades.labor.electrical.treehouseScoped } },
      });
    });
    t.electricalUpgrades.equipment.items.forEach((id: number) => {
      lineItems.push({
        equipment_id: id,
        additional_data: { electrical: { treehouse_scoped: t.electricalUpgrades.equipment.electrical.treehouseScoped } },
      });
    });
  }

  function gatherOtherData() {
    if (t.otherData.item.name !== null) {
      lineItems.push({ labor_id: t.otherData.item.laborId, equipment_id: t.otherData.item.equipmentId, show_in_proposal: true });
    }
  }

  // ---- catalog sanity check (done before gathering in the original) ----
  const anyDownflow = (t.heatPump?.ahu?.units || []).some((u: any) => u?.configuration?.downflow);
  const expectedIds = (REQUIRED_IDS_BY_TYPE[t.cost_system_type] || []).filter(
    (k) => anyDownflow || !['cma_1_id', 'dfk_m_id', 'dfk_s_id'].includes(k),
  );
  const missingIds = expectedIds.filter((k) => requiredIds[k] === undefined || requiredIds[k] === null);
  if (missingIds.length > 0) {
    throw new Error(
      'specSystemDetails: catalog lookup failed for ' + missingIds.join(', ') +
        ' (system type ' + t.cost_system_type + '). Spec aborted rather than writing line items with undefined ids.',
    );
  }

  if (t.cost_system_type === 'hvac') gatherHeatPumpData();
  if (t.cost_system_type === 'water heater') gatherHPWHData();
  if (t.cost_system_type === 'ev') gatherEvData();
  if (t.cost_system_type === 'energy efficiency') gatherEeData();
  if (t.cost_system_type === 'cooktop') gatherIwData();
  if (t.cost_system_type === 'panel') gatherElectricalUpgradeData();
  if (t.cost_system_type === 'adder') gatherOtherData();
  if (t.cost_system_type === 'labor warranty') gatherLaborWarrantyData();

  /* ---------------- generic jurisdiction engine ---------------- */
  const rules = refData.jurisdictionRules || [];
  const house = t.specIncentives?.house || {};
  const houseState = (house.state || '').trim().toUpperCase();
  const houseCity = (house.city || '').trim().toLowerCase();

  rules.forEach((rule) => {
    if (!rule.is_active) return;
    if (rule.state && rule.state.trim().toUpperCase() !== houseState) return;
    if (rule.city && rule.city.trim().toLowerCase() !== houseCity) return;

    let isEligible = true;
    if (rule.criteria && Array.isArray(rule.criteria)) {
      isEligible = rule.criteria.every((cond) => evaluateCriterion(getNestedValue(t, cond.path), cond));
    } else {
      isEligible = false;
    }

    if (isEligible) {
      let count = 1;
      if (rule.multiplier_type === 'dynamic' && rule.multiplier_value) {
        const dynVal = getNestedValue(t, String(rule.multiplier_value));
        count = Number(dynVal) || 0;
      } else if (rule.multiplier_type === 'static' && rule.multiplier_value) {
        count = Number(rule.multiplier_value) || 1;
      }
      for (let i = 0; i < count; i++) {
        if (rule.equipment_id) lineItems.push({ equipment_id: rule.equipment_id, line_item_type: 'equipment' });
        if (rule.labor_id) lineItems.push({ labor_id: rule.labor_id, line_item_type: 'labor' });
      }
    }
  });

  /* ---------------- specEquipment ---------------- */
  let finalItems: LineItem[] = lineItems;
  if (t.cost_system_type !== 'labor warranty' && lineItems.length > 0) {
    finalItems = specEquipmentUnsafe(lineItems, equipmentData, laborData, {
      CircuitDifficultBB2: t.specEquipment?.CircuitDifficultBB2,
      CircuitDifficultBB1: t.specEquipment?.CircuitDifficultBB1,
      CircuitLengthBB2: t.specEquipment?.CircuitLengthBB2,
      CircuitLengthBB1: t.specEquipment?.CircuitLengthBB1,
      isManualBBOverride: t.heatPump?.branchBoxes?.advanced?.isManualOverride || false,
    });
  }

  /* ---------------- advanced branch boxes ---------------- */
  if (t.heatPump?.branchBoxes?.advanced?.enabled && t.heatPump.branchBoxes.advanced.calculatedBoxes) {
    const branchBoxData = t.heatPump.branchBoxes.advanced;
    const isManualOverride = branchBoxData.isManualOverride;
    const equipmentDataArray = Object.values(equipmentData);

    if (branchBoxData.isManualOverride) {
      branchBoxData.calculatedBoxes.forEach((box: any) => {
        const boxEquipment = equipmentDataArray.find((eq) => eq.model_number === box.model);
        if (boxEquipment) {
          finalItems.push({
            equipment_id: boxEquipment.id,
            line_item_type: 'equipment',
            description: (boxEquipment.model_number ? boxEquipment.model_number + ' | ' : '') + boxEquipment.equipment_name,
            equipment_provider: boxEquipment.provider,
            additional_data: {
              branchBoxId: box.id,
              branchBoxName: box.name,
              isTeeJoint: box.type === 'tee',
              assignedUnits: box.assignedUnits || [],
              isManual: true,
              capacity: { max: box.maxCapacity, used: box.assignedUnits?.length || 0, remaining: box.remainingCapacity },
              refrigerant: box.refrigerant || null,
            },
          });
        }
      });
    } else {
      const branchBoxesOnly = branchBoxData.calculatedBoxes.filter((box: any) => box.type !== 'tee');
      branchBoxesOnly.forEach((box: any) => {
        const boxEquipment = equipmentDataArray.find((eq) => eq.model_number === box.model);
        if (boxEquipment) {
          let existingLineItem: LineItem | undefined;
          const allMatchingItems = finalItems.filter((li) => li.equipment_id === boxEquipment.id);
          if (allMatchingItems.length === 1) {
            existingLineItem = allMatchingItems[0];
          } else {
            existingLineItem = allMatchingItems.find((li) => !li.additional_data?.branchBoxId);
            if (!existingLineItem) return;
          }
          if (existingLineItem) {
            if (!existingLineItem.additional_data) existingLineItem.additional_data = {};
            existingLineItem.additional_data.branchBoxId = box.id;
            existingLineItem.additional_data.branchBoxName = box.name;
            existingLineItem.additional_data.assignedUnits = box.assignedUnits || [];
            existingLineItem.additional_data.capacity = {
              max: box.maxCapacity,
              used: box.assignedUnits?.length || 0,
              remaining: box.remainingCapacity,
            };
            existingLineItem.additional_data.refrigerant = box.refrigerant || null;
            existingLineItem.additional_data.isManual = isManualOverride;
          }
        }
      });
    }
  }

  /* ---------------- surge protection ---------------- */
  (() => {
    const surgeEligible = ['hvac', 'water heater', 'panel'].includes(t.cost_system_type);
    const effectiveDateStr = t.PricingEffectiveDate ?? t.pricingEffectiveDate;
    const effectiveDate = effectiveDateStr ? new Date(effectiveDateStr) : null;
    const cutoffDate = new Date(SURGE_CUTOFF);
    if (!surgeEligible || !t.surgeProtection || !effectiveDate || effectiveDate < cutoffDate) return;

    const pushWithDesc = (laborId: number) => {
      const la = laborData[laborId];
      const item: LineItem = { labor_id: laborId, line_item_type: 'labor' };
      if (la) item.description = la.name;
      finalItems.push(item);
    };

    if (t.surgeProtection === 'Whole Home') {
      pushWithDesc(122);
    } else if (t.surgeProtection === 'Single Circuit') {
      finalItems.forEach((li) => {
        if (!li.labor_id) return;
        const labor = laborData[li.labor_id];
        if (labor && labor.subcategory === 'circuit' && labor.circuit_voltage === 240) pushWithDesc(121);
      });
    }
  })();

  /* ---------------- AHRI lookup ---------------- */
  if (newSystem.system_type === 'hvac') {
    const systemDuctingType = getHvacSystemType(finalItems, equipmentData);

    if (systemDuctingType === 'ducted') {
      const newItemId = 563;
      const newItemData = equipmentData[newItemId];
      if (newItemData) {
        finalItems.push({
          equipment_id: newItemId,
          line_item_type: 'equipment',
          description: (newItemData.model_number ? newItemData.model_number + ' | ' : '') + newItemData.equipment_name,
          equipment_provider: newItemData.provider,
        });
      }
    }

    const indoorUnits = getIndoorUnits(finalItems, equipmentData);
    const outdoorUnit = getOutdoorUnit(finalItems, equipmentData);
    const outdoorUnitModel = outdoorUnit?.model_number || null;
    const furnace = indoorUnits.find((unit) => unit?.equipment_type === 'furnace');

    let indoorModel: string | null = null;
    let furnaceModel: string | null = null;
    let coilModel: string | null = null;

    if (furnace) {
      const coil = indoorUnits.find((unit) => unit?.equipment_type === 'Dual-Fuel Coil');
      furnaceModel = furnace.model_number || null;
      coilModel = coil?.model_number || null;
      indoorModel = null;
    } else if (indoorUnits.length > 0) {
      const firstUnit = indoorUnits.find((unit) => Boolean(unit?.model_number));
      indoorModel = firstUnit ? (firstUnit.model_number as string) : null;
    }

    ahriRecord = findAhriRecord(refData.ahri, {
      condenserModel: outdoorUnitModel,
      indoorModel,
      systemDuctingType,
      furnaceModel,
      coilModel,
      waterHeaterModel: null,
    });
  } else if (newSystem.system_type === 'water heater') {
    const waterHeaterLineItem = finalItems.find((item) => {
      const equipment = equipmentData[item.equipment_id as number];
      return equipment && equipment.equipment_type === 'HPWH';
    });
    if (waterHeaterLineItem) {
      const waterHeaterModel = equipmentData[waterHeaterLineItem.equipment_id as number]?.model_number ?? null;
      ahriRecord = findAhriRecord(refData.ahri, {
        condenserModel: null,
        indoorModel: null,
        systemDuctingType: null,
        furnaceModel: null,
        coilModel: null,
        waterHeaterModel,
      });
    }
  }

  if (ahriRecord) {
    newSystem.ahri_id = ahriRecord.id;
  } else if (newSystem.system_type === 'hvac') {
    throw new Error('No AHRI record found for system as specified');
  } else {
    newSystem.ahri_id = null;
  }

  return {
    ok: true,
    errors,
    lineItems: finalItems,
    newSystem: newSystem as NewSystem,
    ahriRecord,
    system_id: t.system_id,
  };
}
