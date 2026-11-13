const finalizedProposalId = 12232; 
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
return relevantEquipmentIds