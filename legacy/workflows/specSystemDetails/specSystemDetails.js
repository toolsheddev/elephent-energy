// specSystemDetails block - full replacement
const t = startTrigger.data;

const isChangeOrder = t.state === 'CO';

if (t.mode !== 'add system' && t.mode !== 'edit system') {
  throw new Error('specSystemDetails: unrecognised mode ' + JSON.stringify(t.mode));
}

let newSystem = {
  system_type: t.cost_system_type,
  system_status: t.mode === 'add system'
    ? (isChangeOrder ? 'proposed - from change order' : 'proposed')
    : t.system_status,
  house_id: t.specIncentives.house.id,
  system_type_detail: {},
  target_margin: t.targetMargin,
  rebate_eligibility_type: t.rebateEligibilityType,
  rebate_effective_date: t.rebateEffectiveDate,
  heating_load_coverage: t.heatLoadCoverage
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
    severity: Math.max(Number(t.timeline) || 0, Number(t.impact) || 0)
  };
}

if (!newSystem.additional_data) {
  newSystem.additional_data = {};
}
newSystem.additional_data.energyEfficiency = {};
let errors = [];
let equipmentData, laborData, ahriRecord;

/*************
 * Functions *
 *************/

function mapRequiredIds(equipmentData, laborData) {
    const ids = {};
    const equipmentArray = Object.values(equipmentData);
    const laborArray = Object.values(laborData);

    // Equipment lookups by model_number
    const equipmentMap = {
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
        const found = equipmentArray.find(item => item.model_number === equipmentMap[key]);
        if (found) ids[key] = found.id;
    }

    // Labor lookups by exact name
    const laborNameMap = {
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
        thermWire_id: 'Thermostat Wiring'
    };
    for (const key in laborNameMap) {
        const found = laborArray.find(item => item.name === laborNameMap[key]);
        if (found) ids[key] = found.id;
    }

    // Labor lookups using .includes()
    const laborIncludesMap = {
        hp_guarantee_id: 'Performance Guarantee',
        hpwhLocationAdder_id: 'HPWH Different Location',
        hpwhDifficultyAdder_id: 'HPWH Difficulty',
        msAdder_id: 'Complicated MS',
        ahuAdder_id: 'Complicated AHU',
        multiAhuDiscount_id: 'Multiple AHU Discount',
    };
    for (const key in laborIncludesMap) {
        const found = laborArray.find(item => item.name.includes(laborIncludesMap[key]));
        if (found) ids[key] = found.id;
    }

    // Map labor warranty IDs (159 to 180)
    const warrantyLaborIds = [159, 160, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 173, 175, 177, 178, 179, 180];
    warrantyLaborIds.forEach(id => {
        if (laborData[id]) ids['labor_' + id] = id;
    });

    // Circuit lookups
    const gfiCircuit = laborArray.find(l => l.circuit_voltage === 120 && l.circuit_amps === 20);
    if (gfiCircuit) ids.gfiCircuit_id = gfiCircuit.id;

    const circuit50A = laborArray.find(l => l.circuit_voltage === 240 && l.circuit_amps === 50);
    if (circuit50A) ids.circuit50A_id = circuit50A.id;

    return ids;
}

function getIndoorUnits(equipmentArray) {
  let indoorUnits = equipmentArray?.filter(item => {
    let equipment = equipmentData[item.equipment_id];
    return item.equipment_id &&
      !item.labor_id &&
      equipment &&
      ['AHU', 'Dual-Fuel Coil', 'Wall Head', 'Ceiling Cassette', 'Floor Head', 'Horizontal-Ducted Head', 'furnace'].includes(equipment.equipment_type);
  }).map(item => {
    return equipmentData[item.equipment_id];
  });
  if (!indoorUnits || indoorUnits.length === 0) return [];
  return indoorUnits;
};

function getOutdoorUnit(equipmentArray) {
  let outdoorUnitResult = equipmentArray.find(unit => unit.equipment_id && equipmentData[unit.equipment_id]?.equipment_type === 'Condenser');
  let outdoorUnitId = outdoorUnitResult ? outdoorUnitResult.equipment_id : null;
  let outdoorUnit = equipmentData[outdoorUnitId];

  if (!outdoorUnit) return [];
  return outdoorUnit;
}

function gatherModalData(requiredIds) {

 function gatherLaborWarrantyData() {
      const lwData = t.laborWarranty || {};

      const hpTerm = Number(
        lwData.warranty?.hp_term
      );

      const hpwhTerm = Number(
        lwData.warranty?.hpwh_term
      );

      const queryRows = warrantyCounts.data || [];
      const countsRecord = Array.isArray(queryRows) ? queryRows[0] : queryRows;

      const pushLabor = (laborId, customDescription) => {
        if (laborId) {
          const laborItem = laborData[laborId];
          lineItems.push({
            labor_id: laborId,
            line_item_type: 'labor',
            description: customDescription || (laborItem ? laborItem.name : undefined)
          });
        }
      };

      // 1. HVAC Systems (Heat Pump) Logic
      if (hpTerm) {
        const manufacturer = countsRecord?.condenser_manufacturer || lwData.manufacturer || '';
        const condenserCount = Number(countsRecord?.condenser_count || 0);
        const ahuCount = Number(countsRecord?.ahu_count || 0);
        const minisplitCount = Number(countsRecord?.minisplit_count || 0);
        const fuel = countsRecord?.fuel_type || '';

        const hvacDescription = `${hpTerm} Years Extended Heat Pump Labor Warranty`;

        if (manufacturer === 'Mitsubishi' && fuel !== 'dual fuel') {
          if (hpTerm === 2) {
            pushLabor(159, hvacDescription);
            if (condenserCount > 1) {
              for (let i = 0; i < condenserCount - 1; i++) pushLabor(163, hvacDescription);
            }
            const totalIndoor = ahuCount + minisplitCount;
            if (totalIndoor > 1) {
              for (let i = 0; i < totalIndoor - 1; i++) pushLabor(164, hvacDescription);
            }
          } else if (hpTerm === 5) {
            pushLabor(160, hvacDescription);
            if (condenserCount > 1) {
              for (let i = 0; i < condenserCount - 1; i++) pushLabor(165, hvacDescription);
            }
            const totalIndoor = ahuCount + minisplitCount;
            if (totalIndoor > 1) {
              for (let i = 0; i < totalIndoor - 1; i++) pushLabor(166, hvacDescription);
            }
          } else if (hpTerm === 12) {
            pushLabor(162, hvacDescription);
            if (condenserCount > 1) {
              for (let i = 0; i < condenserCount - 1; i++) pushLabor(167, hvacDescription);
            }
            const totalIndoor = ahuCount + minisplitCount;
            if (totalIndoor > 1) {
              for (let i = 0; i < totalIndoor - 1; i++) pushLabor(168, hvacDescription);
            }
          }
        } else if (manufacturer !== 'Mitsubishi' || fuel === 'dual fuel') {
          if (hpTerm === 2) {
            if (condenserCount === 1 && ahuCount === 1 && minisplitCount === 0) pushLabor(169, hvacDescription);
            if (condenserCount === 1 && ahuCount === 0 && minisplitCount >= 1) pushLabor(178, hvacDescription);
            if (minisplitCount > 1) {
              for (let i = 0; i < minisplitCount - 1; i++) pushLabor(173, hvacDescription);
            }
          } else if (hpTerm === 5) {
            if (condenserCount === 1 && ahuCount === 1 && minisplitCount === 0) pushLabor(170, hvacDescription);
            if (condenserCount === 1 && ahuCount === 0 && minisplitCount >= 1) pushLabor(179, hvacDescription);
            if (minisplitCount > 1) {
              for (let i = 0; i < minisplitCount - 1; i++) pushLabor(175, hvacDescription);
            }
          } else if (hpTerm === 10) {
            if (condenserCount === 1 && ahuCount === 1 && minisplitCount === 0) pushLabor(171, hvacDescription);
            if (condenserCount === 1 && ahuCount === 0 && minisplitCount >= 1) pushLabor(180, hvacDescription);
            if (minisplitCount > 1) {
              for (let i = 0; i < minisplitCount - 1; i++) pushLabor(177, hvacDescription);
            }
          }
        }
      }

      // 2. Water Heater Systems (HPWH) Logic
      if (hpwhTerm) {
        const waterHeaterCount = Number(countsRecord?.water_heater_count || countsRecord?.hpwh_count || 1);
        const hpwhDescription = `10 Years Extended Heat Pump Water Heater Labor Warranty`;

        for (let i = 0; i < waterHeaterCount; i++) {
          pushLabor(181, hpwhDescription);
        }
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

    lineItems.push({
      labor_id: requiredIds.hp_guarantee_id,
      show_in_proposal: true,
    });

    if (t.heatPump.controls.integrated.enabled) {
      lineItems.push({ equipment_id: t.heatPump.controls.integrated.model });
    }

    if (t.heatPump.controls.wiresNeeded > 0) {
      for (let i = 0; i < t.heatPump.controls.wiresNeeded; i++) {
        lineItems.push({ labor_id: requiredIds.thermWire_id });
      }
    }

    if (t.heatPump?.kumoSetup?.spec && t.heatPump.ahu.count > 0) {
      for (let i = 0; i < t.heatPump.ahu.count; i++) {
        lineItems.push({ equipment_id: 33, line_item_type: 'equipment' });
      }
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
      hasFurnace = t.heatPump.ahu.units.some(u => {
          let eq = equipmentData[u.model?.id];
          return eq && eq.equipment_type && eq.equipment_type.toLowerCase().includes('furnace');
      });
      hasDualFuelCoil = t.heatPump.ahu.units.some(u => {
          let eq = equipmentData[u.model?.id];
          return eq && eq.equipment_type && eq.equipment_type === 'Dual-Fuel Coil';
      });
    }

    let eligibleAhuCount = 0;
    let pvcVentingAlreadyAdded = false;

    const ahuUnits = (t.heatPump && t.heatPump.ahu && Array.isArray(t.heatPump.ahu.units)) ? t.heatPump.ahu.units : [];
    ahuUnits.forEach((unit, key) => {
      if (unit && unit.model && unit.model.id !== null && unit.model.id !== undefined) {
        const equipment = equipmentData[unit.model.id];
        if (!equipment) {
          throw new Error('specSystemDetails: no equipment row for AHU id ' + unit.model.id + ' at zone ' + key);
        }
        const equipmentType = equipment.equipment_type;

        let isFurnaceOrCoil = (equipmentType === 'furnace' || equipmentType === 'Dual-Fuel Coil');

        if (equipmentType === 'furnace') hasFurnace = true;
        if (equipmentType === 'Dual-Fuel Coil') hasDualFuelCoil = true;

        lineItems.push({
          equipment_id: unit.model.id,
          location: unit.location,
          zone_index: key,
          additional_data: {
            electrical: unit.electrical,
            downflowConfiguration: unit.configuration.downflow,
            branchBoxAssignment: unit.branchBoxAssignment || null
          },
        });

        if (unit.configuration && unit.configuration.downflow && !isFurnaceOrCoil) {
          const mn = String(equipment.model_number || '').trim().toUpperCase();
          const mbhMatch = mn.match(/^SVZ-[A-Z]{2}(\d{2})/);
          const mbh = mbhMatch ? parseInt(mbhMatch[1], 10) : null;
          let downflowKitId = null;
          if (mn.indexOf('PVFY') === 0) {
            downflowKitId = null;
          } else if (mn.indexOf('PVA') === 0) {
            downflowKitId = requiredIds.cma_1_id;
          } else if (mn.indexOf('SVZ') === 0) {
            if (mbh === null) {
              throw new Error('Downflow checked on ' + mn + ' but its tonnage could not be read from the model number');
            }
            downflowKitId = (mbh >= 30) ? requiredIds.dfk_m_id : requiredIds.dfk_s_id;
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
            additional_data: {
              electrical: unit.electrical,
              ahuStageTemps: unit.heatKit.stageTemps,
            },
          });
        }

        if (unit.location === 'Attic') lineItems.push({ labor_id: requiredIds.atticAdder_id });
        else if (unit.location === 'Crawlspace') lineItems.push({ labor_id: requiredIds.crawlAdder_id });

        let hideThermostat = (equipmentType === 'Dual-Fuel Coil' && hasFurnace);

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
        if (unit.complications?.a2lVentilation){
          lineItems.push({ labor_id: 127, line_item_type: 'labor' });
        }

        if (unit.humidifier.id !== null && unit.thermostat.id !== null && unit.thermostat.model_number === 'MHK2') {
          lineItems.push({ equipment_id: requiredIds.cn24_id });
        }
        if (unit.thermostat.model_number === 'MHK2' && (unit.thermostat.accessory.id === requiredIds.aidoo_id || unit.thermostat.accessory.id === requiredIds.aidoo_pro_id)) {
          lineItems.push({ equipment_id: requiredIds.cn105_splitter_id });
        }
        if (unit.pvcVenting === true) {
          pvcVentingAlreadyAdded = true;
          lineItems.push({ labor_id: 119, line_item_type: 'labor', zone_index: key });
        }

        if (!isFurnaceOrCoil) {
          if (eligibleAhuCount > 0) {
            lineItems.push({ labor_id: requiredIds.multiAhuDiscount_id });
          }
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

    t.heatPump.miniSplit.units.forEach((unit, key) => {
      if (unit.model.id !== null) {
        lineItems.push({
          equipment_id: unit.model.id,
          zone_index: key,
          location: unit.location,
          additional_data: { branchBoxAssignment: unit.branchBoxAssignment || null }
        });
      }
      if (unit.thermostat.accessory.id !== null) {
        lineItems.push({ equipment_id: unit.thermostat.accessory.id, zone_index: key });
      }
      if (unit.a2lVentilation){
        lineItems.push({ labor_id: 127, line_item_type: 'labor' });
      }
      if (unit.quiltPanel){
        lineItems.push({
          equipment_id: unit.quiltPanel,
          line_item_type: 'equipment',
          zone_index: key,
        });
      }
    });

    if (t.heatPump.branchBoxes.outside.enabled && t.heatPump.branchBoxes.outside.count > 0) {
      for (let i = 0; i < t.heatPump.branchBoxes.outside.count; i++) {
        lineItems.push({ equipment_id: requiredIds.bbEnclosure_id });
      }
    }

    if (t.heatPump.miniSplit.count > 0 || t.heatPump.ahu.units.length > 0) {
      newSystem.system_type_detail.fuel = 'heat pump';
    }

    if (hasFurnace && hasDualFuelCoil) {
      newSystem.system_type_detail.fuel = 'dual fuel';

      const furnaceUnit = t.heatPump.ahu.units.find(u => {
          const eq = equipmentData[u.model?.id];
          return eq && eq.equipment_type && eq.equipment_type.toLowerCase().includes('furnace');
      });

      if (furnaceUnit && furnaceUnit.switchoverTemp != null && furnaceUnit.switchoverTemp !== "") {
          newSystem.system_type_detail.switchover_temp = Number(furnaceUnit.switchoverTemp);
      }
    } else if (hasDualFuelCoil && !hasFurnace) {
      newSystem.system_type_detail.fuel = 'dual fuel';

      const coilUnit = t.heatPump.ahu.units.find(u => {
          const eq = equipmentData[u.model?.id];
          return eq && eq.equipment_type === 'Dual-Fuel Coil';
      });

      if (coilUnit && coilUnit.switchoverTemp != null && coilUnit.switchoverTemp !== "") {
          newSystem.system_type_detail.switchover_temp = Number(coilUnit.switchoverTemp);
      }
    }

    if (t.laborWarranty) {
      gatherLaborWarrantyData();
    }
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
            treehouse_scoped: t.HPWH.electrical.treehouseScoped
          }
        }
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
    if (t.energyEfficiency.audit.enabled) lineItems.push({ labor_id: requiredIds.eeAudit_id });
    if (t.energyEfficiency.airSealing.enabled) lineItems.push({ labor_id: requiredIds.eeAirSealing_id });

    if (t.energyEfficiency.atticInsulation.enabled && t.energyEfficiency.atticInsulation.squareFeet > 0){
      lineItems.push({
        labor_id: requiredIds.eeAtticInsulation_id,
        quantity: t.energyEfficiency.atticInsulation.squareFeet
      });
      newSystem.additional_data.energyEfficiency.atticInsulation_sqft = t.energyEfficiency.atticInsulation.squareFeet;
    }

    if (t.energyEfficiency.atticAirSealing.enabled && t.energyEfficiency.atticAirSealing.squareFeet > 0){
      lineItems.push({
        labor_id: requiredIds.eeAtticSealing_id,
        quantity: t.energyEfficiency.atticAirSealing.squareFeet
      });
      newSystem.additional_data.energyEfficiency.atticAirSealing_sqft = t.energyEfficiency.atticAirSealing.squareFeet;
    }

    if (t.energyEfficiency.blowerTest.enabled) lineItems.push({ labor_id: requiredIds.eeBlowerTest_id });

    if (t.energyEfficiency.crawlspace.enabled && t.energyEfficiency.crawlspace.squareFeet > 0){
      lineItems.push({
        labor_id: requiredIds.eeCrawlspace_id,
        quantity: t.energyEfficiency.crawlspace.squareFeet
      });
      newSystem.additional_data.energyEfficiency.crawlspace_sqft = t.energyEfficiency.crawlspace.squareFeet;
    }

    if (t.energyEfficiency.aeroseal.enabled && t.energyEfficiency.aeroseal.ahuCount > 0){
      lineItems.push({
        labor_id: requiredIds.eeAeroseal_id,
        quantity: t.energyEfficiency.aeroseal.ahuCount
      });
    }

    if (t.energyEfficiency.vaporGuard.enabled && t.energyEfficiency.vaporGuard.squareFeet > 0){
      lineItems.push({
        labor_id: requiredIds.eeVaporGuard_id,
        quantity: t.energyEfficiency.vaporGuard.squareFeet
      });
      newSystem.additional_data.energyEfficiency.vaporGuard_sqft = t.energyEfficiency.vaporGuard.squareFeet;
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
            treehouse_scoped: t.evCharging.electrical.treehouseScoped
          }
        }
      });
      newSystem.system_type_detail.fuel = "electric";
    } else if (t.evCharging.electrical.plugOrHardwired.value !== null) {
      lineItems.push({
        labor_id: requiredIds.circuit50A_id,
        additional_data: {
          electrical: {
            circuit_length: t.evCharging.electrical.circuitLength,
            difficult: t.evCharging.electrical.difficult,
            termination: t.evCharging.electrical.plugOrHardwired.value,
            treehouse_scoped: t.evCharging.electrical.treehouseScoped
          }
        }
      });
      newSystem.system_type_detail.fuel = "electric";
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
            treehouse_scoped: t.inductionWiring.electrical.treehouseScoped
          }
        }
      });
      newSystem.system_type_detail.fuel = 'electric';
    }
  }

  function gatherElectricalUpgradeData() {
    t.electricalUpgrades.labor.items.forEach(id => {
      lineItems.push({
        labor_id: id,
        additional_data: {
          electrical: {
            treehouse_scoped: t.electricalUpgrades.labor.electrical.treehouseScoped
          }
        }
      });
    });

    t.electricalUpgrades.equipment.items.forEach(id => {
      lineItems.push({
        equipment_id: id,
        additional_data: {
          electrical: {
            treehouse_scoped: t.electricalUpgrades.equipment.electrical.treehouseScoped
          }
        }
      });
    });
  }

  function gatherOtherData() {
    if (t.otherData.item.name !== null) {
      lineItems.push({
        labor_id: t.otherData.item.laborId,
        equipment_id: t.otherData.item.equipmentId,
        show_in_proposal: true
      });
    }
  }

  let lineItems = [];
  if (t.cost_system_type === 'hvac') gatherHeatPumpData();
  if (t.cost_system_type === 'water heater') gatherHPWHData();
  if (t.cost_system_type === 'ev') gatherEvData();
  if (t.cost_system_type === 'energy efficiency') gatherEeData();
  if (t.cost_system_type === 'cooktop') gatherIwData();
  if (t.cost_system_type === 'panel') gatherElectricalUpgradeData();
  if (t.cost_system_type === 'adder') gatherOtherData();
  if (t.cost_system_type === 'labor warranty') gatherLaborWarrantyData();


  // =====================================================================
  // --- 100% GENERIC JURISDICTION ENGINE ---
  // =====================================================================
  const rules = getJurisdictionRules.data || [];

  const getNestedValue = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
  };

  const evaluateCriterion = (actualValue, condition) => {
    switch (condition.operator) {
      case 'exists':
        return actualValue !== undefined && actualValue !== null && actualValue !== false && actualValue !== "";
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
        return condition.value.some(val => actualValue.includes(val));
      default:
        return false;
    }
  };

  const house = t.specIncentives?.house || {};
  const houseState = (house.state || '').trim().toUpperCase();
  const houseCity = (house.city || '').trim().toLowerCase();

  rules.forEach(rule => {
    if (!rule.is_active) return;

    if (rule.state && rule.state.trim().toUpperCase() !== houseState) return;
    if (rule.city && rule.city.trim().toLowerCase() !== houseCity) return;

    let isEligible = true;
    if (rule.criteria && Array.isArray(rule.criteria)) {
      isEligible = rule.criteria.every(cond => {
        const actualValue = getNestedValue(t, cond.path);
        return evaluateCriterion(actualValue, cond);
      });
    } else {
      isEligible = false;
    }

    if (isEligible) {
      let count = 1;

      if (rule.multiplier_type === 'dynamic' && rule.multiplier_value) {
        const dynVal = getNestedValue(t, rule.multiplier_value);
        count = Number(dynVal) || 0;
      } else if (rule.multiplier_type === 'static' && rule.multiplier_value) {
        count = Number(rule.multiplier_value) || 1;
      }

      for (let i = 0; i < count; i++) {
        if (rule.equipment_id) {
          lineItems.push({ equipment_id: rule.equipment_id, line_item_type: 'equipment' });
        }
        if (rule.labor_id) {
          lineItems.push({ labor_id: rule.labor_id, line_item_type: 'labor' });
        }
      }
    }
  });
  // =====================================================================

  return lineItems;
}

equipmentData = getEquipmentData.data.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

laborData = t.laborData.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

const requiredIds = mapRequiredIds(equipmentData, laborData);

const REQUIRED_IDS_BY_TYPE = {
  'hvac': ['cn24_id','bbEnclosure_id','aidoo_id','aidoo_pro_id','cn105_splitter_id','cma_1_id','dfk_m_id',
           'dfk_s_id','pumpHpLabor_id','thermWire_id','hp_guarantee_id','atticAdder_id','crawlAdder_id',
           'msAdder_id','ahuAdder_id','multiAhuDiscount_id','gfiCircuit_id'],
  'water heater': ['pumpHpwhLabor_id','tmvLabor_id','expansionTankLabor_id','drainPanLabor_id',
                   'hpwhLocationAdder_id','hpwhDifficultyAdder_id','gfiCircuit_id'],
  'energy efficiency': ['eeAudit_id','eeAtticInsulation_id','eeAtticSealing_id','eeAirSealing_id',
                        'eeAeroseal_id','eeBlowerTest_id','eeCrawlspace_id','eeVaporGuard_id'],
  'ev': ['circuit50A_id'],
  'cooktop': [],
  'panel': [],
  'adder': [],
  'labor warranty': []
};

const anyDownflow = (t.heatPump?.ahu?.units || []).some(u => u?.configuration?.downflow);
const expectedIds = (REQUIRED_IDS_BY_TYPE[t.cost_system_type] || [])
  .filter(k => anyDownflow || !['cma_1_id', 'dfk_m_id', 'dfk_s_id'].includes(k));
const missingIds = expectedIds.filter(k => requiredIds[k] === undefined || requiredIds[k] === null);
if (missingIds.length > 0) {
  throw new Error('specSystemDetails: catalog lookup failed for ' + missingIds.join(', ') +
    ' (system type ' + t.cost_system_type + '). Spec aborted rather than writing line items with undefined ids.');
}

let lineItems = gatherModalData(requiredIds);

if (t.cost_system_type !== 'labor warranty' && lineItems.length > 0) {
  const specResult = await specEquipment(
    equipmentData, 
    laborData, 
    lineItems, 
    t.specEquipment?.CircuitDifficultBB2, 
    t.specEquipment?.CircuitDifficultBB1, 
    t.specEquipment?.CircuitLengthBB2, 
    t.specEquipment?.CircuitLengthBB1, 
    t.heatPump?.branchBoxes?.advanced?.isManualOverride || false
  );
  lineItems = specResult.data;
}
if (t.heatPump?.branchBoxes?.advanced?.enabled && t.heatPump.branchBoxes.advanced.calculatedBoxes) {
  const branchBoxData = t.heatPump.branchBoxes.advanced;
  const isManualOverride = branchBoxData.isManualOverride;
  const equipmentDataArray = Object.values(equipmentData);

  if (branchBoxData.isManualOverride) {
    branchBoxData.calculatedBoxes.forEach(box => {
        const boxEquipment = equipmentDataArray.find(eq => eq.model_number === box.model);

        if (boxEquipment) {
          lineItems.push({
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
              capacity: {
                max: box.maxCapacity,
                used: box.assignedUnits?.length || 0,
                remaining: box.remainingCapacity
              },
              refrigerant: box.refrigerant || null
            }
          });
        }
    });
  } else {
    const branchBoxesOnly = branchBoxData.calculatedBoxes.filter(box => box.type !== 'tee');

    branchBoxesOnly.forEach(box => {
      const boxEquipment = equipmentDataArray.find(eq => eq.model_number === box.model);
      if (boxEquipment) {
        let existingLineItem;

        const allMatchingItems = lineItems.filter(li => li.equipment_id === boxEquipment.id);

        if (allMatchingItems.length === 1) {
          existingLineItem = allMatchingItems[0];
        } else {
          existingLineItem = allMatchingItems.find(li => !li.additional_data?.branchBoxId);
          if (!existingLineItem) return;
        }

        if (existingLineItem) {
          if (!existingLineItem.additional_data) {
            existingLineItem.additional_data = {};
          }

          existingLineItem.additional_data.branchBoxId = box.id;
          existingLineItem.additional_data.branchBoxName = box.name;
          existingLineItem.additional_data.assignedUnits = box.assignedUnits || [];
          existingLineItem.additional_data.capacity = {
            max: box.maxCapacity,
            used: box.assignedUnits?.length || 0,
            remaining: box.remainingCapacity
          };
          existingLineItem.additional_data.refrigerant = box.refrigerant || null;
          existingLineItem.additional_data.isManual = isManualOverride;
        }
      }
    });
  }
}

// --- Surge Protection Spec'ing ---
(() => {
  const surgeEligible = ['hvac', 'water heater', 'panel'].includes(t.cost_system_type);

  const effectiveDateStr = t.PricingEffectiveDate ?? t.pricingEffectiveDate;
  const effectiveDate = effectiveDateStr ? new Date(effectiveDateStr) : null;
  const cutoffDate = new Date('2025-10-29');

  if (!surgeEligible || !t.surgeProtection || !effectiveDate || effectiveDate < cutoffDate) return;

  const pushWithDesc = (laborId) => {
    const la = laborData[laborId];
    const item = { labor_id: laborId, line_item_type: 'labor' };
    if (la) item.description = la.name;
    lineItems.push(item);
  };

  if (t.surgeProtection === 'Whole Home') {
    pushWithDesc(122);
  } else if (t.surgeProtection === 'Single Circuit') {
    lineItems.forEach((li) => {
      if (!li.labor_id) return;
      const labor = laborData[li.labor_id];
      if (labor && labor.subcategory === 'circuit' && labor.circuit_voltage === 240) {
        pushWithDesc(121);
      }
    });
  }
})();

// --- Start of AHRI Lookup Logic ---
if (newSystem.system_type === 'hvac') {
  let systemDuctingType = await getHvacSystemType(lineItems, equipmentData);
  systemDuctingType = systemDuctingType.data;

  if (systemDuctingType === 'ducted') {
    const newItemId = 563;
    const newItemData = equipmentData[newItemId];

    if (newItemData) {
      const equipmentLineItem = {
        equipment_id: newItemId,
        line_item_type: 'equipment',
        description: (newItemData.model_number ? newItemData.model_number + ' | ' : '') + newItemData.equipment_name,
        equipment_provider: newItemData.provider
      };
      lineItems.push(equipmentLineItem);
    }
  }

  let indoorUnits = getIndoorUnits(lineItems);
  let outdoorUnit = getOutdoorUnit(lineItems);
  let outdoorUnitModel = outdoorUnit?.model_number || null;

  const furnace = indoorUnits.find(unit => unit?.equipment_type === 'furnace');

  let indoorModel = null;
  let furnaceModel = null;
  let coilModel = null;

  if (furnace) {
    const coil = indoorUnits.find(unit => unit?.equipment_type === 'Dual-Fuel Coil');
    furnaceModel = furnace.model_number || null;
    coilModel = coil?.model_number || null;
    indoorModel = null;
  } else if (indoorUnits && indoorUnits.length > 0) {
    // Select only the first valid indoor unit model number
    const firstUnit = indoorUnits.find(unit => Boolean(unit?.model_number));
    indoorModel = firstUnit ? firstUnit.model_number : null;
  }

  let waterHeaterModel = null;

  console.log('AHRI Query Params:', {
    outdoorUnitModel,
    indoorModel,
    systemDuctingType,
    furnaceModel,
    coilModel,
    waterHeaterModel
  });

  ahriRecord = await ahri(
    outdoorUnitModel,
    indoorModel,
    systemDuctingType,
    furnaceModel,
    coilModel,
    waterHeaterModel
  );

} else if (newSystem.system_type === 'water heater') {
  const waterHeaterLineItem = lineItems.find(item => {
    const equipment = equipmentData[item.equipment_id];
    return equipment && equipment.equipment_type === 'HPWH';
  });

  if (waterHeaterLineItem) {
    const waterHeaterModel = equipmentData[waterHeaterLineItem.equipment_id]?.model_number;
    ahriRecord = await ahri(null, null, null, null, null, waterHeaterModel);
  }
}

if (ahriRecord && ahriRecord.data && ahriRecord.data.length > 0) {
    ahriRecord = ahriRecord.data[0];
    newSystem.ahri_id = ahriRecord.id;
} else {
    if (newSystem.system_type === 'hvac') {
        throw new Error('No AHRI record found for system as specified');
    } else {
        newSystem.ahri_id = null;
    }
}

const transformedErrors = (errors || []).map(err => ({
  name: err.name,
  message: err.message,
  stack: err.stack,
}));

return {
  errors: transformedErrors,
  lineItems: lineItems,
  newSystem: newSystem,
  equipmentData: equipmentData,
  ahriRecord: ahriRecord,
  laborData: laborData,
  system_id: t.system_id
};