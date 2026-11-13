addtlLineItemsList.setValue([{
  line_item_type: lineItemType.value,
  description: discountDesc.value ? discountDesc.value : lineItemName.value,
  price_actual: newLineItemAmount.value,
  manually_added: true,
  state: 'transient',
  status: in_out_system.value !== 'out_system' 
    ? (state.value === 'CO' ? 'proposed - from change order' : 'active - from finalized proposal') 
    : (segmentedControlLineitem.value === 'co_line_item' ? 'proposed - from change order' : 'active - from finalized proposal'),
  ...(segmentedControlLineitem.value === 'co_line_item' && {
    change_order_details: {
      description: changeOrderDesc2.value,
      reason: changeOrderReason2.value,
      requester: requester2.value,
      timeline: timeline2.value,
      impact: impact2.value,
      respParty: responsible2.value,
      customerConsent: customerConsent2.value,
      installerConsent: installerConsent2.value,
      severity: Math.max(timeline2.value, impact2.value),
    }
  })
}]);