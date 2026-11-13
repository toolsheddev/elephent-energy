function formatCurrency(value, locale = 'en-US', currency = 'USD') {
    const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
    });
    let formatted = formatter.format(Math.round(value));
    formatted = formatted.substr(0, formatted.length - 3);
    return formatted;
}

function getOption(level,type){
  let option = mpOptions.filter(option => option.plan_level === level && option.type === type);
  if(!option || option.length < 1)
	throw new Error('Did not find a maintenance plan option for plan level '+level+' and type '+type);
  else if(option.length > 1)
    throw new Error('Found multiple maintenance plan options for plan level '+level+' and type '+type);
  else
    return option[0];
}

function getOptions(type){
  console.log(mpOptions)
  console.log(levels)

  return levels.map(level => getOption(level,type));
}

function equipmentCount(type,lineItems){
  if(typeof type === 'string')
    type = [type];
  
  return lineItems.reduce((acc,item) => {
    if(item.line_item_type === 'equipment' && type.includes(equipment[item.equipment_id]?.equipment_type))
      return acc + 1;
    else
      return acc;
  },0)
}
  

let mpOptions = {{maint_plans_w_prices.data}};
let allLineItems = {{line_items.data}};
let equipment = {{equipment_by_id.data}};

let proposalIds = {{optionNames.data.map(i => i.id)}};
let systems = {{new_systems.data}};
let planDetails = [];

proposalIds.forEach(proposalId => {
  let lineItems = allLineItems.filter(item => systems.filter(sys => sys.proposal_id === proposalId).map(sys => sys.id).includes(item.system_id));
  // Get counts for condensers, ahus, heads only
  let condenserCt = equipmentCount('Condenser',lineItems);
  let ahuCt = equipmentCount(['AHU', 'Horizontal-Ducted Head'],lineItems);
  let headCt = equipmentCount(['Wall Head','Ceiling Cassette','Floor Head'],lineItems);
  
  // Only process plan types for basic HVAC maintenance plan - addt'l options are shown in the image below the table
  planDetails.push({
    'base': Math.min(1,condenserCt),
    'additional_condenser': Math.max(0,condenserCt - 1),
    'additional_ahu': Math.max(0,ahuCt - condenserCt),
    'additional_head': Math.max(0,headCt - 3*Math.max(0,condenserCt - ahuCt))
  });
});

let levels = mpOptions.reduce((acc,plan) => {
  if(acc.length === 0 && plan.plan_level)
    return [plan.plan_level]
  else if(!plan.plan_level || acc.includes(plan.plan_level))
    return acc;
  else if(plan.plan_level)
    return [...acc,plan.plan_level];
},[]);

return levels.map(level => {
  let basePlan = getOption(level,'base');
  
  let returnValue = {
    level: level,
    package: level + ' Maintenance',
    warranty_yrs: basePlan.labor_warranty_yrs < 12 ? basePlan.labor_warranty_yrs + (basePlan.labor_warranty_yrs === 1 ? ' Year' : ' Years') : 'Up to ' + basePlan.labor_warranty_yrs + ' Years*',
    visits_yearly: level === 'Basic' ? '1x per Year' : '2x per Year'
  }

  planDetails.forEach((detail,i) => {
    let price = Object.keys(detail).reduce((acc,planType) => {
      let plan = getOption(level,planType);
      return plan?.price ? acc + detail[planType] * Number(plan.price) : acc;
    },0);

    // Adding the message for the price, using formatCurrency to ensure dollar signs are present
    returnValue['Option '+(i+1)] = `${formatCurrency(price)} for 2 years (${formatCurrency(price / 2)} each additional year)`;
  });

  return returnValue;
});
