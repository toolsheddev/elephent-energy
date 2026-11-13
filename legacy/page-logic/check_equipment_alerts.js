// Reference the query directly without
const activeAlerts = get_all_active_alerts.data;

// If there are no alerts or data hasn't loaded, return a function that safely returns false
if (!activeAlerts || !activeAlerts.equipment_id) {
  return () => false;
}

// Return the checker function so we can pass arguments from the UI components
return (equipmentIds, marketId) => {
  if (!equipmentIds || !marketId) return false;
  
  // Ensure equipmentIds is always an array
  const idsToCheck = Array.isArray(equipmentIds) ? equipmentIds : [equipmentIds];
  
  // Check if any of the passed equipment IDs have an active alert in the target market
  for (let i = 0; i < activeAlerts.equipment_id.length; i++) {
    if (
      activeAlerts.market[i] === marketId && 
      idsToCheck.includes(activeAlerts.equipment_id[i])
    ) {
      return true; // Alert found!
    }
  }
  
  return false; // No alerts found
};