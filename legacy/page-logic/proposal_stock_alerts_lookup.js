const systemsData = {{  systems.data }};
const lineItemsData = {{ line_items.data }}

if (!systemsData || !lineItemsData) {
      return {}; 
    }

const systemsArray = Array.isArray(systemsData) ? systemsData : formatDataAsArray(systemsData);
const lineItemsArray = Array.isArray(lineItemsData) ? lineItemsData : formatDataAsArray(lineItemsData);
const activeAlerts = {{  get_all_active_alerts.data }};

// Replace this with your actual market ID reference
const currentMarketId = {{  house.data.market_id }}; 

const alertsMap = {}; // This will hold { proposal_id: [alerted_eq_ids] }

// 1. Safety check
if (!systemsArray.length || !lineItemsArray.length || !activeAlerts || !activeAlerts.equipment_id) {
  return alertsMap;
}

// 2. Extract only the equipment IDs that have alerts in the current market (for fast checking)
const marketAlertEqIds = new Set();
for (let i = 0; i < activeAlerts.equipment_id.length; i++) {
  if (activeAlerts.market[i] === currentMarketId) {
    marketAlertEqIds.add(activeAlerts.equipment_id[i]);
  }
}

// 3. Build the lookup dictionary
systemsArray.forEach(system => {
  const propId = system.proposal_id;
  
  // Initialize the array if this proposal hasn't been seen yet
  if (!alertsMap[propId]) {
    alertsMap[propId] = [];
  }

  // Find all line items for this specific system
  const systemItems = lineItemsArray.filter(item => item.system_id === system.id);
  
  // Check each item against our alerted equipment list
  systemItems.forEach(item => {
    if (item.equipment_id && marketAlertEqIds.has(item.equipment_id)) {
      // Add it to the proposal's alert list if it's not already there
      if (!alertsMap[propId].includes(item.equipment_id)) {
        alertsMap[propId].push(item.equipment_id);
      }
    }
  });
});

return alertsMap;