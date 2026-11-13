function filterLineItemsBySystemId(lineItemsData, idsArray) {
    // Filter the line items data where system_id is included in the idsArray
    return lineItemsData.filter(lineItem => idsArray.includes(lineItem.system_id));
}

// Example usage
const filteredData = filterLineItemsBySystemId({{line_items.data}}, {{finalized_systems.data.id}});

function mergeLineItemsWithAdditionalData(filteredData) {

    let equipmentDataSource = {{equipmentOptions.data}};
    let laborDataSource = {{laborOptions.data}};
    let incentiveDataSource = {{incentiveOptions.data}};
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
//return filteredData;
return mergeLineItemsWithAdditionalData(filteredData);