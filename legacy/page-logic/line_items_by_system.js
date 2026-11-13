function filterLineItemsBySystemId(lineItemsData, key_value) {
    // Filter the systems data where system_id matches key_value
    return lineItemsData.filter(lineItem => lineItem.system_id == key_value);
}

// Example usage
const filteredData = filterLineItemsBySystemId({{line_items.data}}, {{active_system_row.value?.id}});


console.log({{  line_items.data}});
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
    {{equipmentOptions.data}}, 
    {{laborOptions.data}}, 
    {{incentiveOptions.data}}
);