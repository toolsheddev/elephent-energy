let system = Object.keys(systemsTable.selectedRow)
  .filter(key => key !== 'id' && key !== 'system_created_at')
  .reduce((obj, key) => {
    obj[key] = systemsTable.selectedRow[key];
    return obj;
  }, {});

let errors = [];

let systemPromise = new Promise((resolve, reject) => {
  insert_system.trigger({
    additionalScope: {
      system: system
    },
    onSuccess: (data) => {
      resolve(data.result[0]); // Assuming there's only one result
    },
    onFailure: reject
  });
}).catch(error => {
  errors.push(error);
  throw error;
});

systemPromise.then(system => {
  console.log('System inserted: ', system);
  // Trigger the query to get items to duplicate
  return new Promise((resolve, reject) => {
    get_items_to_duplicate.trigger({
      additionalScope: {
        system_id: systemsTable.selectedRowKey
      },
      onSuccess: (data) => {
        console.log('Items to duplicate received: ', data);  // Logging the data here
        resolve({ items: data, system: system });  // Pass system along with data
      },
      onFailure: reject
    });
  });
}).then(({ items, system }) => {  // Destructure items and system from the resolved object
  let lineItems = items.map(item => {
    let newItem = {};
    Object.keys(item)
      .filter(key => key !== 'id' && key !== 'line_item_created_at')
      .forEach(key => {
        newItem[key] = item[key];
      });
    newItem.system_id = system.id; // Now system is explicitly in scope
    return newItem;
  });

  console.log('Line items to be inserted: ', lineItems);
  // Insert new line items
  return new Promise((resolve, reject) => {
    insert_line_items.trigger({
      additionalScope: {
        lineItems: lineItems
      },
      onSuccess: resolve,
      onFailure: reject
    });
  });
}).catch(error => {
  errors.push(error);
  console.log('Error processing line items: ', error);
}).finally(() => {
  if(errors.length > 0){
    let plainErrors = errors.map(error => {
      return { message: error.message, name: error.name, stack: error.stack, fail: error.fail };
    });
    NewSystemErrors.setValue(plainErrors);
    NewSystemErrorsModal.setHidden(false);
  }
  // Reset modal or any other UI elements as necessary
  resetNewSystem.trigger();
});