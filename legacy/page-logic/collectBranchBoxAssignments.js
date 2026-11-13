// Debug logging
console.log('=== collectBranchBoxAssignments START ===');
console.log('advanceMode.value:', advanceMode.value);
console.log('AHU rowKeys:', CostAHUList3.rowKeys);
console.log('MS rowKeys:', CostMsList3.rowKeys);

// Always return an object structure, never null
const assignments = {
  ahus: {},
  miniSplits: {}
};

// Only collect if advanced mode is enabled AND we have units
if (!advanceMode.value) {
  console.log('Advanced mode is OFF, returning empty assignments');
  return assignments;
}

// Collect AHU assignments
if (CostAHUList3.rowKeys && CostAHUList3.rowKeys.length > 0) {
  CostAHUList3.rowKeys.forEach((key, index) => {
    // Check if the dropdown exists
    const dropdown = AHUBranchBoxAssignment[key];
    const assignedBox = dropdown?.value;
    const ahuModelId = AHUModel3[key]?.selectedItem?.id || AHUModel3[key]?.value;
    
    console.log(`AHU index ${index}, key ${key}:`, {
      dropdownExists: !!dropdown,
      assignedBox: assignedBox,
      ahuModelId: ahuModelId
    });
    
    assignments.ahus[index] = {
      key: key,
      modelId: ahuModelId,
      assignedTo: assignedBox || null
    };
  });
}

// Collect Mini-Split assignments
if (CostMsList3.rowKeys && CostMsList3.rowKeys.length > 0) {
  CostMsList3.rowKeys.forEach((key, index) => {
    const dropdown = MSBranchBoxAssignment[key];
    const assignedBox = dropdown?.value;
    const msModelId = MsModel3[key]?.selectedItem?.id || MsModel3[key]?.value;
    
    console.log(`MS index ${index}, key ${key}:`, {
      dropdownExists: !!dropdown,
      assignedBox: assignedBox,
      msModelId: msModelId
    });
    
    assignments.miniSplits[index] = {
      key: key,
      modelId: msModelId,
      assignedTo: assignedBox || null
    };
  });
}

console.log('=== Final assignments ===', assignments);
console.log('=== collectBranchBoxAssignments END ===');

return assignments;