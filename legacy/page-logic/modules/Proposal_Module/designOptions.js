const proposals = {{optionNames.data.map(i => i.id)}};
const systems = {{new_systems.data}};
const lineItems = {{line_items.data}};
const equipment = {{equipment_by_id.data}};
const labor = {{labor_by_id.data}};
const electricalBreakout = {{DisplayOptions.value.includes('electrical_breakout')}};
const ahris = {{ahri.data}};

const systemSortOrder = ['hvac', 'water heater', 'ev charging', '*', 'maintenance plan', 'other'];
const customOrder = ["System", "Outdoor Unit(s)", "Max Decibels (Outdoor Unit)", "Indoor Unit(s)", "Max Decibels (Indoor Unit)", "AHRI", "Cooling Efficiency (EER2)", "Seasonal Cooling Efficiency (SEER2)", "Heating Efficiency (HSPF2)", "Cold Weather Backup (-15F)", "Humidifier", "Thermostat"];

function sortSystems(a, b) {
  const orderMap = new Map(systemSortOrder.map((type, index) => [type, index]));
  const defaultIndex = systemSortOrder.indexOf('*');
  const getOrderIndex = type => orderMap.has(type) ? orderMap.get(type) : defaultIndex;
  return getOrderIndex(a.system_type) - getOrderIndex(b.system_type);
}

let tableData = proposals.map(proposal => {
  let proposalSystems = systems.filter(system => system.proposal_id === proposal).sort(sortSystems);

  let systemDataArray = proposalSystems.map(system => {
    let items = lineItems.filter(item => item.system_id === system.id && item.line_item_type === 'equipment' && !equipment[item.equipment_id]?.equipment_type.includes('Accessory'));
    let systemData = {
      "System": "",
      "Outdoor Unit(s)": "",
      "Max Decibels (Outdoor Unit)": "",
      "Indoor Unit(s)": "",
      "Max Decibels (Indoor Unit)": "",
      "Uniform Energy Factor (UEF)": "",
      "Cold Weather Backup (-15F)": "",
      "Humidifier": "",
      "Thermostat": ""
    };

    let ahuDetails = [];
    let ahuDecibelsAdded = false;
    let condenserName = '';

    items.forEach(item => {
  let equipmentDetails = equipment[item.equipment_id];
  let equipmentType = equipmentDetails?.equipment_type;

  if (['Ceiling Cassette', 'Floor Head', 'Horizontal-Ducted Head', 'Wall Head', 'AHU','Dual-Fuel Coil'].includes(equipmentType)) {
    ahuDetails.push(`${equipmentType} - ${equipmentDetails?.model_number}`);
    if (equipmentDetails?.decibels && !ahuDecibelsAdded) {
      systemData["Max Decibels (Indoor Unit)"] = equipmentDetails?.decibels + " dB";
      ahuDecibelsAdded = true;
    }
  } else if (equipmentType === 'Condenser') {
    condenserName = equipmentDetails?.equipment_name ? `<b>${equipmentDetails.equipment_name}</b>` : "";
    systemData["Outdoor Unit(s)"] = equipmentDetails?.model_number + ' (' + equipmentDetails?.fan_type + ' ' + 'fan)';
    if (equipmentDetails?.decibels) {
      systemData["Max Decibels (Outdoor Unit)"] = equipmentDetails?.decibels + " dB";
    }
  } else if (equipmentType === 'Humidifier') {
    systemData["Humidifier"] = equipmentDetails?.equipment_name;
  } else if (equipmentType === 'Thermostat') {
    systemData["Thermostat"] = equipmentDetails?.equipment_name;
  } else if (equipmentType === 'EV Charger') {
    systemData["System"] = equipmentDetails?.equipment_name ? `<b>${equipmentDetails.equipment_name}</b>` : "";
    systemData["Outdoor Unit(s)"] = equipmentDetails?.model_number;
  } else if (equipmentType === 'Heat Kit') {
    systemData["Cold Weather Backup (-15F)"] = equipmentDetails?.model_number + ' | ' + equipmentDetails?.equipment_name;
  } else {
    console.log('Equipment type not matched: ', equipmentType);
  }
});

    // Set the condenser name as the system name if available
    if (condenserName) {
      systemData["System"] = condenserName;
    }

    if (ahuDetails.length > 0) {
      systemData['Indoor Unit(s)'] = ahuDetails.join('<br>');
    }

    for (const ahriId in ahris) {
      if (ahris[ahriId].id === system.ahri_id) {
        systemData['AHRI'] = ahris[ahriId].ahri_number;
        systemData['Cooling Efficiency (EER2)'] = ahris[ahriId].eer;
        systemData['Seasonal Cooling Efficiency (SEER2)'] = ahris[ahriId].seer_2;
        systemData['Heating Efficiency (HSPF2)'] = ahris[ahriId].hspf_2;
        break;
      }
    }

    return systemData;
  });

  // Ensure that the EV Charger system is its own distinct column
  let definedSystems = systemDataArray.filter(system => system["System"] !== "");

  let result = [];

  customOrder.forEach(label => {
    let entry = {
      label: label
    };

    let allEmpty = true;

    definedSystems.forEach((system, index) => {
      const value = system[label] || "";
      entry[`system${index + 1}`] = value;
      if (value) {
        allEmpty = false;
      }
    });

    // Only include entry if not all values are empty
    if (!allEmpty) {
      if (label === "System") {
        entry.label = `<b>${label}</b>`;
        for (let key in entry) {
          if (key !== "label" && entry[key]) {
            entry[key] = entry[key].includes("<b>") ? entry[key] : `<b>${entry[key]}</b>`;
          }
        }
      }

      result.push(entry);
    }
  });

  return result;
});

return tableData;
