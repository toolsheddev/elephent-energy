await systems.trigger();
await line_items.trigger();
function filterLineItemsBySystemId(lineItemsData, key_value) {
    return lineItemsData.filter(lineItem => lineItem.system_id == key_value);
}

// Example usage
//  const filteredData = filterLineItemsBySystemId(line_items.data, systemsTable.selectedRow.id);
const filteredData = filterLineItemsBySystemId(line_items.data, systemToUpdate.value.id);
console.log("System Id: ", systemToUpdate);
function mergeLineItemsWithAdditionalData(filteredData, equipmentDataSource, laborDataSource, incentiveDataSource) {
    return filteredData.map(lineItem => {
        let mergedData = { ...lineItem };

        if (lineItem.equipment_id != null) {
            let equipmentData = equipmentDataSource.find(equipItem => equipItem.id === lineItem.equipment_id);
            mergedData = { ...mergedData, ...equipmentData, id: lineItem.id };
        }

        if (lineItem.labor_id != null) {
            let laborData = laborDataSource.find(laborItem => laborItem.id === lineItem.labor_id);
            mergedData = { ...mergedData, ...laborData, id: lineItem.id };
        }

        if (lineItem.incentive_id != null) {
            let incentiveData = incentiveDataSource.find(incentiveItem => incentiveItem.id === lineItem.incentive_id);
            mergedData = { ...mergedData, ...incentiveData, id: lineItem.id ,name: incentiveData.name};
        }

        return mergedData;
    });
}

// Example usage
return mergeLineItemsWithAdditionalData(
    filteredData, 
    equipmentOptions.data, 
    laborOptions.data, 
    incentiveOptions.data
);
