// Every reason Calculate Pricing is currently disabled, as a list.
// calculatePricing2.disabled is just this being non-empty, so the button
// and the message next to it can never disagree.
const rows = listView2.instanceValues || [];
const last = rows[rows.length - 1];
const isCO = segmentedControlLineitem.value === 'co_line_item';
const loading = specIncentivesWorkflow.isFetching || prices_all.isFetching || specEquipment.isFetching || pricingLineItems.isFetching || maintenance_plans.isFetching || getHvacSystemType.isFetching;

return [
  loading ? 'Still working out prices. Give it a second.' : null,
  rows.length === 0 ? 'Add at least one line item.' : null,
  ...rows.map((row, idx) => (!row?.lineItemName && !row?.discountDesc) ? 'Row ' + (idx + 1) + ': pick a type detail, or type a description if it is a discount.' : null),
  ...(isCO && rows.length ? [
    !last?.changeOrderDesc2 ? 'Change order: add a description.' : null,
    !last?.changeOrderReason2 ? 'Change order: add a reason.' : null,
    !last?.requester2 ? 'Change order: add a requester.' : null,
    !last?.timeline2 ? 'Change order: add a timeline.' : null,
    !last?.impact2 ? 'Change order: add an impact.' : null,
    !last?.responsible2 ? 'Change order: name who is responsible.' : null
  ] : [])
].filter(Boolean);