async function newItems() {
  // We will pass `rowParams` via additionalScope from the global loop
  let idFields = {
    equipment: 'equipment_id',
    labor: 'labor_id',
    incentive: 'incentive_id',
    discount: 'discount_id'
  }
  
  let newItem = {
    line_item_type: rowParams.lineItemType,
    description: rowParams.itemName, // Passed from our lookup
    ...(rowParams.hasCircuit && {
      additional_data: {
        electrical: {
          circuit_length: rowParams.circuitLength
        }
      }
    })
  }
  
  newItem[idFields[newItem.line_item_type]] = rowParams.itemId;
  let items = [newItem];
  
  console.log('before spec equipments', items);
  
  // spec addtl equipment
  items = await new Promise((resolve,reject) => {
    specEquipment.trigger({
      additionalScope: { lineItems: items },
      onSuccess: resolve,
      onFailure: reject
    });
  });
  
  console.log('after spec equipments', items);

  // Adding state, manually_added, status and change_order_details fields
  items = items.map(item => {
    return {
      ...item,
      state: 'transient',
      manually_added: true,
      show_in_proposal: true,
      status: in_out_system.value !== 'out_system'
        ? (state.value === 'CO' ? 'proposed - from change order' : 'active - from finalized proposal')
        : (rowParams.segmentedControl === 'co_line_item' ? 'proposed - from change order' : 'active - from finalized proposal'),
      ...(rowParams.segmentedControl === 'co_line_item' && {
        change_order_details: {
          description: rowParams.changeOrderDesc,
          reason: rowParams.changeOrderReason,
          requester: rowParams.requester,
          timeline: rowParams.timeline,
          impact: rowParams.impact,
          respParty: rowParams.responsible,
          customerConsent: rowParams.customerConsent,
          installerConsent: rowParams.installerConsent,
          severity: Math.max(rowParams.timeline || 0, rowParams.impact || 0),
        }
      })
    };
  });

  // price line items
  let addtlScope = {
    lineItems: items,
    pricingStructure: project.data.pricing_structure
  }
  
  if(equipment_by_id.timestamp > 0 && equipment_by_id.data) addtlScope.equipmentData = equipment_by_id.data;
  if(labor_by_id.timestamp > 0 && labor_by_id.data) addtlScope.laborData = labor_by_id.data;

  let pricingResult = await new Promise((resolve,reject) => {
    priceLineItems.trigger({
      additionalScope: addtlScope,
      onSuccess: resolve,
      onFailure: reject
    });
  });

  items = pricingResult.result;
  return items;
}

const result = await newItems();
console.log('tyl', result);
return result;