// Query results are available as the `data` variable
function arrayToObjectById(array) {
    return array.reduce((acc, item) => {
        // Use the item's id as the key for the accumulated object
        if (item.id !== undefined) {
            acc[item.id] = item;
        }
        return acc;
    }, {});
};
return arrayToObjectById(equipment_by_id.data);