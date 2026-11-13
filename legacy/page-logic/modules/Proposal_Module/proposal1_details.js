const proposals = {{optionNames.data.map(item => item.id)}};
const systems = {{new_systems.data}};
const lineItems = {{line_items.data}};
const equipment = {{equipment_by_id.data}};

// Initialize result variables
let foundMiniSplit = false;
let fanTypeResult = null;
let foundAHU = false;

// Get the first proposal
let firstProposal = proposals[0]; // Only work with the first proposal

// Filter systems by proposal_id for the first proposal
let proposalSystems = systems.filter(system => system.proposal_id === firstProposal);

for (let system of proposalSystems) {
  // Filter line items by system_id and line_item_type for the first proposal's systems
  let items = lineItems.filter(item => item.system_id === system.id && item.line_item_type === 'equipment');

  for (let item of items) {
    let equipmentDetails = equipment[item.equipment_id];
    let equipmentType = equipmentDetails?.equipment_type?.toLowerCase(); // Case-insensitive
    let fanType = equipmentDetails?.fan_type?.toLowerCase(); // Case-insensitive for fan type

    // Check for MiniSplit types
    if (['ceiling cassette', 'floor head', 'horizontal-ducted head', 'wall head'].includes(equipmentType)) {
      foundMiniSplit = true;
    }

    // Check for Condenser types and fan type (single/double)
    if (equipmentType === 'condenser') {
      if (fanType === 'single') {
        if (fanTypeResult === 'dual') {
          fanTypeResult = 'both'; // If double was found before, now it's both
        } else {
          fanTypeResult = 'single'; // If no double has been found, mark as single
        }
      } else if (fanType === 'dual') {
        if (fanTypeResult === 'single') {
          fanTypeResult = 'both'; // If single was found before, now it's both
        } else {
          fanTypeResult = 'dual'; // If no single has been found, mark as double
        }
      }
    }

    // Check for AHU types
    if (equipmentType === 'ahu') {
      foundAHU = true;
    }

    // Break early if both MiniSplit is found and the fanType result is 'both' (all criteria met)
    if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) {
      break;
    }
  }

  if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) {
    break;
  }
}

// Create a result object to return
const result = {
  miniSplitFound: foundMiniSplit,
  condenserFanType: fanTypeResult, // "single", "double", "both", or null if not found
  ahuFound: foundAHU
};

// Return the final result
return result;
