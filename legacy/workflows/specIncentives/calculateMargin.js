let passthroughTypes = ['incentive','change order','margin','permit','discount'];
var lineItems = startTrigger.data.lineItems;
if(!lineItems)
  throw new Error('lineItems not passed in as additional scope');
var system = startTrigger.data.system;
if(!system)
  throw new Error('system not passed in as additional scope');

let oldMargin = lineItems.find(item => item.line_item_type === 'margin');
let returnItems = lineItems.filter(item => item.line_item_type !== 'margin');

let systemTarget = system.target_margin; // system's true margin — never use for persisted items
// New line item margin — falls back to system target if not explicitly set
let transientTarget = (startTrigger.data.transientMargin != null && startTrigger.data.transientMargin !== '')
    ? startTrigger.data.transientMargin 
    : systemTarget;

const calculateMargin = (price, target) => Math.round((target * price / (1 - target)) * 100) / 100;

returnItems.forEach((item, index) => {
  let price = 0;
  if (!passthroughTypes.includes(item.line_item_type)) {
    price = item.price_actual ? Number(item.price_actual) : 0;
  }

  if (startTrigger.data.initialAdd) {
    item.margin_amount = calculateMargin(price, systemTarget);
    item.margin_to_include = true;
  } else {
    console.log("index", index, item.description, item.state);
    if (item.state === 'persisted') {
      // false means "exclude margin"; not-set means "include".
      if (item.margin_to_include !== false) {
        // ✅ Use each item's own stored margin_percent, fall back to systemTarget
        let itemTarget = item.margin_percent != null ? item.margin_percent : systemTarget;
        item.margin_amount = calculateMargin(price, itemTarget);
      } else if (item.margin_to_include === false) {
        item.margin_amount = 0;
      }
    } else if (item.state === 'transient') {
      console.log("index with trans", index, item.description, item.state);
      if (startTrigger.data.system_margin === 'exclude') {
        item.margin_amount = 0;
        item.margin_to_include = false;
      } else if (startTrigger.data.system_margin === 'add') {
        // ✅ Use transientTarget (the new item's intended margin), not systemTarget
        item.margin_amount = calculateMargin(price, transientTarget);
        item.margin_percent = Math.abs(Number(transientTarget) - Number(systemTarget)) > 1e-6
          ? transientTarget
          : null;
        item.margin_to_include = true;
      }
    }
  }
});


returnItems.forEach(item => {
  if (item.state === 'transient') {
    item.state = 'persisted';
  }
});

const excludedStatuses = [
  'proposed - from change order',
  'pending deletion',
  'deleted - from change order'
];

let margin = returnItems.reduce((acc, item) => {
  if (!excludedStatuses.includes(item.status)) {
    return acc + Number(item.margin_amount || 0);
  }
  return acc;
}, 0);

console.log('Margin: '+margin);
// create margin line item
let marginLineItem = {
  price_actual : margin,
  line_item_type : 'margin',
  description: 'Elephant Margin'
};
if(oldMargin && oldMargin.id)
  marginLineItem.id = oldMargin.id;

// Add new margin to line items
returnItems.push(marginLineItem);
console.log(returnItems)

return returnItems;
