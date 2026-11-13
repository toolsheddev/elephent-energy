let system = systemsTable.selectedRowKey;

function addtlItemsObject(n) {
  let items = []; // Initialize as an array

  for (let i = 0; i < n; i++) {
    // Push a new object into the items array
    items.push({
      index: i,
      line_item_type: lineItemType[i].value,
      equipment_id: lineItemType[i].value === 'equipment' ? lineItemName[i].value : null,
      labor_id: lineItemType[i].value === 'labor' ? lineItemName[i].value : null,
      incentive_id: lineItemType[i].value === 'incentive' ? lineItemName[i].value : null,
      description: lineItemType[i].value === 'discount' ?discountDesc[i].value : null,
      system_id: system
    });
  }

  return items; // Returns an array of items
}

const num = lineItemsList.instances;
const addtlItems = addtlItemsObject(num);

/* Price line items */
  let pricingStructure = PricingStructure.value ? PricingStructure.value : project.data.pricing_structure;
var errors = [];

  pricingPromise = await new Promise((resolve,reject) => {
    priceLineItems.trigger({
      additionalScope: {
        lineItems: addtlItems,
        pricingStructure: pricingStructure
      },
      onSuccess: resolve,
      onFailure: reject
    });
  });
  lineItems = pricingPromise.result;
  console.log('pricingPromise')
  console.log(pricingPromise)
  if(pricingPromise.errors)
    errors = errors.concat(pricingPromise.errors);
  
  /* Incentive line items */
  let incentives = await specIncentives(lineItems);
  lineItems = lineItems.concat(incentives);

  /* Margin */
  lineItems = await new Promise((resolve,reject) => {
    calculateMargin.trigger({
      additionalScope: {
        lineItems: addtlItems
      },
      onSuccess: resolve,
      onFailure: reject
    });
  });

  /* Remove any empty line items, as a protection */
  lineItems = lineItems.filter(item => {
    return item && item instanceof Object && Object.keys(item) && Object.keys(item).length > 0;
  });

  /* Loop through line items to add UI parameters */
  lineItems.forEach((item,i) => {
    if(item.line_item_type && item.line_item_type === 'equipment'){
      let equipment = equipmentData[item.equipment_id];
      item.description = (equipment.model_number ? equipment.model_number+' | ' : '') + equipment.equipment_name;
    } else if(item.line_item_type && item.line_item_type === 'labor'){
      let labor = laborData[item.labor_id];
      item.description = labor.name;
    } else if(item.line_item_type && item.line_item_type === 'incentive'){
      let incentive = incentivesData[item.incentive_id];
      item.description = incentive.name;
    } else if(item.line_item_type && item.line_item_type === 'margin'){
      item.description = 'Elephant Margin';
    }
    item.temp_id = i;
  });