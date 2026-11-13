// Only run if advanced mode is enabled
if (!manualBBOverride.value && !advanceMode.value) {
  return {
    boxes: [],
    availableForUnit: {}
  };
}

// Get the calculated branch boxes
const branchBoxes = calculateBranchBoxes.data?.branchBoxes || [];

// Initialize capacity tracking for each box
const boxCapacity = {};
branchBoxes.forEach(box => {
  // Determine max capacity based on type
  let maxCapacity = 0;
  if (box.type === '3-port') maxCapacity = 3;
  else if (box.type === '5-port') maxCapacity = 5;
  else if (box.type === '2-port') maxCapacity = 2;
  else if (box.type === '4-port') maxCapacity = 4;
  else if (box.type === '8-port') maxCapacity = 8;
  else if (box.type === 'tee') maxCapacity = 2; // Tee joints connect 2 branch boxes
  
  boxCapacity[box.id] = {
    id: box.id,
    name: box.name,
    type: box.type,
    model: box.model,
    maxCapacity: maxCapacity,
    assignedUnits: [],
    remainingCapacity: maxCapacity
  };
});

// Count assignments from AHUs
if (CostAHUList3.rowKeys) {
  CostAHUList3.rowKeys.forEach((key, index) => {
    const assignedBox = AHUBranchBoxAssignment[key]?.value;
    const ahuModel = AHUModel3[key]?.selectedItem?.model_number || 
                     AHUModel3[key]?.selectedItem?.equipment_name ||
                     `AHU ${index + 1}`;
    
    if (assignedBox && boxCapacity[assignedBox]) {
      boxCapacity[assignedBox].assignedUnits.push({
        type: 'AHU',
        index: index,
        key: key,
        name: ahuModel,
        modelId: AHUModel3[key]?.selectedItem?.id
      });
      boxCapacity[assignedBox].remainingCapacity--;
    }
  });
}

// Count assignments from Mini-Splits
if (CostMsList3.rowKeys) {
  CostMsList3.rowKeys.forEach((key, index) => {
    const assignedBox = MSBranchBoxAssignment[key]?.value;
    const msModel = MsModel3[key]?.selectedItem?.model_number || 
                    MsModel3[key]?.selectedItem?.equipment_name ||
                    `MS ${index + 1}`;
    
    if (assignedBox && boxCapacity[assignedBox]) {
      boxCapacity[assignedBox].assignedUnits.push({
        type: 'MS',
        index: index,
        key: key,
        name: msModel,
        modelId: MsModel3[key]?.selectedItem?.id
      });
      boxCapacity[assignedBox].remainingCapacity--;
    }
  });
}

// Create availability map for each unit
// This tells us which boxes are available for which unit
const availableForUnit = {
  ahus: {},
  miniSplits: {}
};

// For each AHU, determine which boxes are available
if (CostAHUList3.rowKeys) {
  CostAHUList3.rowKeys.forEach((key, index) => {
    const currentAssignment = AHUBranchBoxAssignment[key]?.value;
    
    // A box is available if:
    // 1. It has remaining capacity, OR
    // 2. It's currently assigned to this unit (so they can keep their choice)
    availableForUnit.ahus[key] = branchBoxes
      .filter(box => {
        const capacity = boxCapacity[box.id];
        return capacity.remainingCapacity > 0 || currentAssignment === box.id;
      })
      .map(box => ({
        value: box.id,
        label: `${box.name}`
      }));
  });
}

// For each Mini-Split, determine which boxes are available
if (CostMsList3.rowKeys) {
  CostMsList3.rowKeys.forEach((key, index) => {
    const currentAssignment = MSBranchBoxAssignment[key]?.value;
    
    availableForUnit.miniSplits[key] = branchBoxes
      .filter(box => {
        const capacity = boxCapacity[box.id];
        return capacity.remainingCapacity > 0 || currentAssignment === box.id;
      })
      .map(box => ({
        value: box.id,
        label: `${box.name} `
      }));
  });
}

return {
  boxes: Object.values(boxCapacity),
  availableForUnit: availableForUnit
};