const proposals = getOptionNames.data.map(i => i.id);
const systems = getSystems.data;
const lineItems = getLineitems.data
const equipment = getEquipmentById.data;
const labor = getLaborById.data;
const electricalBreakout = startTrigger.data.electricalBreakout;
const ahris = getAhri.data;

const systemSortOrder = ['hvac', 'water heater', 'ev charging', 'panel', '*', 'maintenance plan', 'labor warranty', 'other', 'adder'];
const customOrder = ["System", "System Type", "Outdoor Unit(s)", "Max Decibels (Outdoor Unit)", "Indoor Unit(s)", "Max Decibels (Indoor Unit)", "AHRI", "Cooling Efficiency (EER2)", "Seasonal Cooling Efficiency (SEER2)", "Heating Efficiency (HSPF2)", "Cold Weather Backup (-15F)", "Humidifier", "Thermostat", "Typical Family Size", "Back-to-Back Showers", "Max Tub Size (gallons)", '*'];

function sortSystems(a, b) {
  const orderMap = new Map(systemSortOrder.map((type, index) => [type, index]));
  const defaultIndex = systemSortOrder.indexOf('*');
  const getOrderIndex = type => orderMap.has(type) ? orderMap.get(type) : defaultIndex;
  return getOrderIndex(a.system_type) - getOrderIndex(b.system_type);
}

let tableData = proposals.map(proposal => {
  let proposalSystems = systems.filter(system => system.proposal_id === proposal).sort(sortSystems);

  let systemDataArray = proposalSystems.map(system => {
    let items = lineItems.filter(item => item.system_id === system.id && ( (item.line_item_type === 'equipment' && !equipment[item.equipment_id]?.equipment_type.includes('Accessory')) ||
(system.system_type === 'panel' && item.line_item_type === 'labor') ));
    let systemData = {
      "System": "",
      "System Type": "",
      "Outdoor Unit(s)": "",
      "Max Decibels (Outdoor Unit)": "",
      "Indoor Unit(s)": "",
      "Max Decibels (Indoor Unit)": "",
      "Uniform Energy Factor (UEF)": "",
      "Cold Weather Backup (-15F)": "",
      "Humidifier": "",
      "Thermostat": "",
      "Typical Family Size": "",
      "Back-to-Back Showers": "",
      "Max Tub Size (gallons)": ""
      
    };

    let ahuDetails = [];
    let ahuDecibelsAdded = false;
    let condenserName = '';

    items.forEach(item => {
  let equipmentDetails = equipment[item.equipment_id];
  let laborDetails = labor[item.labor_id];
  let equipmentType = equipmentDetails?.equipment_type;

  systemData["System Type"] = system.system_type;

  if (['Ceiling Cassette', 'Floor Head', 'Horizontal-Ducted Head', 'Wall Head', 'AHU','Dual-Fuel Coil', 'furnace'].includes(equipmentType)) {
    ahuDetails.push(`${equipmentDetails?.model_number} (${equipmentType})`);
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

  } else if (equipmentType === 'HPWH') {
    const gallons = equipmentDetails?.capacity_gallons;
    
    systemData["System"] = equipmentDetails?.equipment_name ? `<b>${equipmentDetails.equipment_name}</b>` : "";
    systemData["Indoor Unit(s)"] = equipmentDetails?.model_number;
    if (equipmentDetails?.uef) {
      systemData["Uniform Energy Factor (UEF)"] = equipmentDetails.uef;
    }
    if (equipmentDetails?.decibels) {
      systemData["Max Decibels (Indoor Unit)"] = equipmentDetails.decibels  + " dB";
    }
    if (gallons) {
    systemData["Typical Family Size"] =
      gallons <= 40 ? "1-3" :
      gallons <= 50 ? "3-4" :
      gallons <= 66 ? "4-5" :
      gallons <= 80 ? "5+" : "";

    systemData["Back-to-Back Showers"] =
      gallons <= 40 ? "2" :
      gallons <= 50 ? "4" :
      gallons <= 66 ? "6" :
      gallons <= 80 ? "7" : "";

    systemData["Max Tub Size (gallons)"] =
      gallons <= 40 ? "60" :
      gallons <= 50 ? "85" :
      gallons <= 66 ? "130" :
      gallons <= 80 ? "155" : ""; 
    }

  } else if (equipmentType === 'Humidifier') {
  systemData["Humidifier"] = equipmentDetails?.equipment_name;
    //if humidifier is spec'd separately, assign it to system name
    if (system.system_type === 'adder' && equipmentDetails?.equipment_name) {
  systemData["System"] += systemData["System"] ? `<br>${equipmentDetails.equipment_name}` : equipmentDetails.equipment_name; }
  
  } else if (equipmentType === 'Thermostat') {
    systemData["Thermostat"] = equipmentDetails?.equipment_name + ' ' + equipmentDetails?.model_number;
    
  } else if (equipmentType === 'EV Charger') {
    systemData["System"] = equipmentDetails?.equipment_name ? `<b>${equipmentDetails.equipment_name}</b>` : "";
    systemData["Outdoor Unit(s)"] = equipmentDetails?.model_number;
    
  } else if (equipmentType === 'Heat Kit') {
    systemData["Cold Weather Backup (-15F)"] = equipmentDetails?.model_number + ' | ' + equipmentDetails?.equipment_name;

  } else if (system.system_type === 'panel') {
    systemData["System"] = 'Electrical Upgrades';
    systemData["Indoor Unit(s)"] = systemData["Indoor Unit(s)"]
    ? `${systemData["Indoor Unit(s)"]}<br>${item.description}`
    : item.description;
    
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

    const nonEmptyCount = Object.values(systemData).filter(val => val && val !== "").length;
return nonEmptyCount >= 2 ? systemData : null;
    })
    .filter(system => system !== null);

 let result = [];

  customOrder.forEach(label => {
    let entry = { label };
    let allEmpty = true;

    systemDataArray.forEach((system, index) => {
      const value = system[label] || "";
      entry[`system${index + 1}`] = value;
      if (value) allEmpty = false;
    });

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