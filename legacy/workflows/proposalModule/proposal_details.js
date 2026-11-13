const proposals = optionNames.data.map(item => item.id);
const systems = new_systems.data;
const line_items = lineItems.data;
const equipment = filterEquipments.data;

const result = {};

// Ensure at least three proposals exist
while (proposals.length < 3) {
  proposals.push(null); // Adding null values to maintain index structure
}

// Iterate over the first three proposals
proposals.slice(0, 3).forEach((proposal, index) => {
  let foundMiniSplit = false;
  let fanTypeResult = null;
  let foundAHU = false;

  if (proposal) {
    // Filter systems by proposal_id for the current proposal
    let proposalSystems = systems.filter(system => system.proposal_id === proposal);

    for (let system of proposalSystems) {
      // Filter line items by system_id and line_item_type
      let items = line_items.filter(item => item.system_id === system.id && item.line_item_type === 'equipment');

      for (let item of items) {
        let equipmentDetails = equipment[item.equipment_id];
        let equipmentType = equipmentDetails?.equipment_type?.toLowerCase();
        let fanType = equipmentDetails?.fan_type?.toLowerCase();

        // Check for MiniSplit types
        if (['ceiling cassette', 'floor head', 'horizontal-ducted head', 'wall head'].includes(equipmentType)) {
          foundMiniSplit = true;
        }

        // Check for Condenser types and fan type (single/double)
        if (equipmentType === 'condenser') {
          if (fanType === 'single') {
            fanTypeResult = fanTypeResult === 'dual' ? 'both' : 'single';
          } else if (fanType === 'dual') {
            fanTypeResult = fanTypeResult === 'single' ? 'both' : 'dual';
          }
        }

        // Check for AHU types
        if (equipmentType === 'ahu') {
          foundAHU = true;
        }

        // Break early if all criteria are met
        if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) {
          break;
        }
      }

      if (foundMiniSplit && fanTypeResult === 'both' && foundAHU) {
        break;
      }
    }
  }

  // Store the details in result object with default values if no proposal details exist
  result[`proposal${index + 1}_details`] = {
    miniSplitFound: proposal ? foundMiniSplit : false,
    condenserFanType: proposal ? fanTypeResult : null,
    ahuFound: proposal ? foundAHU : false
  };
});

// Return the final result object
return result;
