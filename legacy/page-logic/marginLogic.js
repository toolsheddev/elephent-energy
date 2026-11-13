let passthroughTypes = ['incentive','change order','margin','permit','discount'];

var lineItems = mergeLineItems.data;
console.log('line items in margin logic',lineItems);
if(!lineItems)
  throw new Error('lineItems not passed in as additional scope');
// Find old margin line item
let oldMargin = lineItems.find(item => item.line_item_type === 'margin');

// Remove old margin line items
let returnItems = lineItems.filter(item => item.line_item_type !== 'margin');

console.log('ri',returnItems)


const excludedStatuses = [
  'proposed - from change order',
  'pending deletion',
  'deleted - from change order'
];

let margin = returnItems.reduce((acc, item) => {
  if (
    !excludedStatuses.includes(item.status) &&
    !passthroughTypes.includes(item.line_item_type)
  ) {
    return acc + Number(item.margin_amount || 0);
  }
  return acc;
}, 0);


// create margin line item
let marginLineItem = {
  price_actual : margin,
  line_item_type : 'margin',
  description: 'Elephant Margin'
};

if(oldMargin && oldMargin.id)
  marginLineItem.id = oldMargin.id;

// Add new margin to line items
console.log('marginLineItem', marginLineItem)
return marginLineItem;
