let changes = Object.entries(hddInfo.changesetObject);
let data = hddInfo.data;

changes.forEach(change => {
    let rowIndex = change[0];
    let changeData = change[1];

    // Merge the change data with the corresponding entry in data
    data[rowIndex] = Object.assign(data[rowIndex], changeData);
});

// Format the data as an array of objects
let formattedData = Object.values(data);

// Convert formattedData to JSON
let jsonData = JSON.stringify(formattedData);
return jsonData;