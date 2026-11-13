const finalizedProposalId = {{ project.data.finalized_proposal_id }}; 
const currentMarketId ={{ house.data.market_id }};

const systemsData = {{  systems.data }};
const lineItemsData = {{ line_items.data }}
if (!finalizedProposalId || !systemsData || !lineItemsData) {
      return []; 
    }

const systemsArray = Array.isArray(systemsData) ? systemsData : formatDataAsArray(systemsData);
const lineItemsArray = Array.isArray(lineItemsData) ? lineItemsData : formatDataAsArray(lineItemsData);

const finalizedSystems = systemsArray.filter(system => system.proposal_id === finalizedProposalId);

if (finalizedSystems.length === 0) return []; 

    // 3. Extract just the system IDs
const systemIds = finalizedSystems.map(system => system.id);

const relevantEquipmentIds = [...new Set(
  lineItemsArray
    .filter(item => systemIds.includes(item.system_id))
    .map(item => item.equipment_id)
    .filter(id => id != null) // Strip out any empty line items
)];
if (relevantEquipmentIds.length === 0) return [];

const activeAlerts = {{  get_all_active_alerts.data }};

if (!activeAlerts || !activeAlerts.equipment_id) return true;

const alertedEquipmentIds = activeAlerts.equipment_id.filter((equipId, i) =>
  activeAlerts.market[i] === currentMarketId &&
  relevantEquipmentIds.includes(equipId)
);
return alertedEquipmentIds;