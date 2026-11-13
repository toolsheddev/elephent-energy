

// Only calculate if advanced mode is enabled
if (!manualBBOverride.value && !advanceMode.value) {
  return { 
    totalUnits: 0, 
    branchBoxes: [], 
    enabled: false 
  };
}

// Get unit counts from your existing ListViews
const ahuCount = CostAHUList3.rowKeys.length || 0;
const miniSplitCount = CostMsList3.rowKeys.length || 0;
const totalUnits = ahuCount + miniSplitCount;

// Get the condenser model to determine outdoor series and refrigerant
let outdoorSeries = null;
let refrigerant = null;
const condenserModel = Condenser1Model3?.selectedItem;
if (condenserModel) {
  outdoorSeries = condenserModel.model_series;
  refrigerant = condenserModel.refrigerant;
}

// Determine indoor series from ANY selected AHU or MS
let indoorSeries = null;

// Check all AHUs (find first selected)
for (let key of CostAHUList3.rowKeys) {
  const m = AHUModel3[key]?.selectedItem;
  if (m?.model_series) {
    indoorSeries = m.model_series;
    break;
  }
}

// If not found in AHU, check MS models
if (!indoorSeries) {
  for (let key of CostMsList3.rowKeys) {
    const m = MsModel3[key]?.selectedItem;
    if (m?.model_series) {
      indoorSeries = m.model_series;
      break;
    }
  }
}


// Get indoor series from first AHU or Mini-Split
//  let indoorSeries = null;

//  // Try to get from AHU first
//  if (ahuCount > 0) {
//    const firstAHUKey = CostAHUList3.rowKeys[0];
//    const firstAHUModel = AHUModel3[firstAHUKey]?.selectedItem;
//    if (firstAHUModel) {
//      indoorSeries = firstAHUModel.model_series;
//    }
//  }

//  // If no AHU, try Mini-Split
//  if (!indoorSeries && miniSplitCount > 0) {
//    const firstMSKey = CostMsList3.rowKeys[0];
//    const firstMSModel = MsModel3[firstMSKey]?.selectedItem;
//    if (firstMSModel) {
//      indoorSeries = firstMSModel.model_series;
//    }
//  }

// Function to calculate branch boxes - MATCHES YOUR WORKFLOW EXACTLY
function getBranchBoxes(unitCount, indoorSeries, outdoorSeries, refrigerant) {
  const boxes = [];
  
  // No branch boxes needed for single unit
  if (unitCount <= 1) {
    return boxes;
  }
  
  // M Series Indoor + M Series Outdoor = no joints needed
  if (indoorSeries === 'M' && outdoorSeries === 'M') {
    return boxes;
  }
  
  // Determine which branch box IDs to use based on refrigerant
  let bb3_name, bb5_name, joint_name;
  let bb3_model, bb5_model, joint_model;
  
  if (refrigerant === 'R-410A') {
    bb3_name = 'Branch Box (3-port PAC-MKA32BC)';
    bb5_name = 'Branch Box (5-port PAC-MKA52BC)';
    joint_name = 'Tee Joint (MSDD-50AR-E)';
    bb3_model = 'PAC-MKA32BC';
    bb5_model = 'PAC-MKA52BC';
    joint_model = 'MSDD-50AR-E';
  } else if (refrigerant === 'R-454B') {
    bb3_name = 'Branch Box (3-port PAC-LMA30BC)';
    bb5_name = 'Branch Box (5-port PAC-LMA50BC)';
    joint_name = 'Tee Joint (MSDD-50AR2-E)';
    bb3_model = 'PAC-LMA30BC';
    bb5_model = 'PAC-LMA50BC';
    joint_model = 'MSDD-50AR2-E';
  } else {
    // Default to R-410A if refrigerant is unknown
    bb3_name = 'Branch Box (3-port PAC-MKA32BC)';
    bb5_name = 'Branch Box (5-port PAC-MKA52BC)';
    joint_name = 'Tee Joint (MSDD-50AR-E)';
    bb3_model = 'PAC-MKA32BC';
    bb5_model = 'PAC-MKA52BC';
    joint_model = 'MSDD-50AR-E';
  }
  
  // M Series Indoor + SM Series Outdoor
  if (indoorSeries === 'M' && outdoorSeries === 'SM') {
    if (unitCount <= 3) {
      boxes.push({ 
        id: 'bb3_1', 
        name: `${bb3_name}`, 
        type: '3-port',
        model: bb3_model,
        refrigerant: refrigerant,
      });
    } else if (unitCount <= 5) {
      boxes.push({ 
        id: 'bb5_1', 
        name: `${bb5_name}`, 
        type: '5-port',
        model: bb5_model,
        refrigerant: refrigerant
      });
    } else if (unitCount === 6) {
      boxes.push({ 
        id: 'bb3_1', 
        name: `Box 1 ${bb3_name}`, 
        type: '3-port',
        model: bb3_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'bb3_2', 
        name: `Box 2 ${bb3_name}`, 
        type: '3-port',
        model: bb3_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'msdd_1', 
        name: joint_name, 
        type: 'tee',
        model: joint_model,
        refrigerant: refrigerant
      });
    } else if (unitCount <= 8) {
      boxes.push({ 
        id: 'bb5_1', 
        name: `Box 1 ${bb5_name}`, 
        type: '5-port',
        model: bb5_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'bb3_1', 
        name: `Box 2 ${bb3_name}`, 
        type: '3-port',
        model: bb3_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'msdd_1', 
        name: joint_name, 
        type: 'tee',
        model: joint_model,
        refrigerant: refrigerant
      });
    } else if (unitCount <= 10) {
      boxes.push({ 
        id: 'bb5_1', 
        name: `Box 1 ${bb5_name}`, 
        type: '5-port',
        model: bb5_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'bb5_2', 
        name: `Box 2 ${bb5_name}`, 
        type: '5-port',
        model: bb5_model,
        refrigerant: refrigerant
      });
      boxes.push({ 
        id: 'msdd_1', 
        name: joint_name, 
        type: 'tee',
        model: joint_model,
        refrigerant: refrigerant
      });
    }
  }
  
  // S Series Indoor + SM Series Outdoor (Branch Joints)
  else if (indoorSeries === 'S' && outdoorSeries === 'SM') {
    if (unitCount === 2) {
      boxes.push({ 
        id: 'cmy62_1', 
        name: 'Branch Joint (2-port CMY-Y62-G-E)', 
        type: '2-port',
        model: 'CMY-Y62-G-E'
      });
    } else if (unitCount <= 4) {
      boxes.push({ 
        id: 'cmy64_1', 
        name: 'Branch Joint (4-port CMY-Y64-G-E)', 
        type: '4-port',
        model: 'CMY-Y64-G-E'
      });
    } else if (unitCount <= 8) {
      boxes.push({ 
        id: 'cmy68_1', 
        name: 'Branch Joint (8-port CMY-Y68-G-E)', 
        type: '8-port',
        model: 'CMY-Y68-G-E'
      });
    }
  }
  
  return boxes;
}

if (manualBBOverride.value) {
  const manualBoxes = [];
  
  const listViewData = manualBranchBoxList.data || [];
  const instanceValues = manualBranchBoxList.instanceValues || [];
  
  console.log('listViewData length:', listViewData.length);
  
  listViewData.forEach((item, index) => {
    const qty = instanceValues[index]?.manualBBQuantity || 0;
    
    console.log(`Item ${index}:`, {
      model: item.model_number,
      qty: qty
    });
    
    if (qty > 0) {
      // Determine port type for consistent naming
      let portType = '';
      if (item.model_number.includes('30') || item.model_number.includes('32')) {
        portType = '3-port';
      } else if (item.model_number.includes('50') || item.model_number.includes('52')) {
        portType = '5-port';
      }
      
      // Add each box based on quantity
      for (let i = 0; i < qty; i++) {
        const boxNumber = i + 1;
        
        manualBoxes.push({
          id: `${item.model_number}_${boxNumber}`,
          // Format name exactly like auto-calculated boxes
          name: qty > 1 
            ? `Box ${boxNumber} Branch Box (${portType} ${item.model_number})`
            : `Branch Box (${portType} ${item.model_number})`,
          type: portType,
          model: item.model_number,
          refrigerant: item.refrigerant,
          maxCapacity: portType === '3-port' ? 3 : 5,
          assignedUnits: []
        });
      }
    }
  });
  
  console.log('Final manualBoxes:', manualBoxes);
  if (manualBoxes.length > 1 && indoorSeries === 'M' && outdoorSeries === 'SM') {
  // Determine which joint model to use based on refrigerant
  let joint_name, joint_model;
  
  if (refrigerant === 'R-410A') {
    joint_name = 'Tee Joint (MSDD-50AR-E)';
    joint_model = 'MSDD-50AR-E';
  } else if (refrigerant === 'R-454B') {
    joint_name = 'Tee Joint (MSDD-50AR2-E)';
    joint_model = 'MSDD-50AR2-E';
  } else {
    // Default to R-410A
    joint_name = 'Tee Joint (MSDD-50AR-E)';
    joint_model = 'MSDD-50AR-E';
  }
  
  // Add one joint (connects the branch boxes together)
  manualBoxes.push({
    id: 'msdd_1',
    name: joint_name,
    type: 'tee',
    model: joint_model,
    refrigerant: refrigerant,
    maxCapacity: 2,
    assignedUnits: []
  });
}
  
  return {
    enabled: true,
    totalUnits,
    ahuCount,
    miniSplitCount,
    indoorSeries,
    outdoorSeries,
    refrigerant,
    branchBoxes: manualBoxes,
    needsSeriesSelection: false,
    isManualOverride: true
  };
}

// Calculate and return results
const branchBoxes = getBranchBoxes(totalUnits, indoorSeries, outdoorSeries, refrigerant);

return {
  enabled: true,
  totalUnits,
  ahuCount,
  miniSplitCount,
  indoorSeries,
  outdoorSeries,
  refrigerant,
  branchBoxes,
  needsSeriesSelection: !indoorSeries || !outdoorSeries
};