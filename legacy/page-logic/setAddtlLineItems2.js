let addtlItems = new Promise((resolve,reject) => {
  addtlLineItems.trigger({  
    onSuccess: resolve,
    onFailure: reject
  });
}).then((result) => {
  console.log('final result:')
  console.log(result)
  addtlLineItemsList.setValue(result);
});

