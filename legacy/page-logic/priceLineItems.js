/**
 * Price line items
 * @param {Array} lineItemArray - array of line items to price
 * @param {string} pricingStructure - string from PricingStructure UI component indicating which price logic to use
 * @returns {Array} - returns input line items with `price_actual` and other parameters populated
 * */
function priceLineItems(lineItemArray,pricingStructure){

  // Double check that lineItemArray is properly formatted
  if(!lineItemArray || !Array.isArray(lineItemArray))
    throw Error('lineItemArray is not an array or is undefined');

  // function to get a price record from a list filtered down to prices for one item
  function getPrices(prices,type,item){
    // Get prices for the right territory
    prices = prices.filter(price => {
      if(pricingStructure === 'standard')
        return price.territory === 'CO';
      else if(pricingStructure === 'ma_forge')
        return price.territory === 'MA';
      else if(pricingStructure === 'ma_laminar')
        return price.territory === 'MA-Laminar';
        else if(pricingStructure === 'la_standard')
        return price.territory === 'CA';
      else if(pricingStructure === 'ichoosr_2026')
        return price.territory === 'iChoosr26';
      else
        throw new Error(pricingStructure+' is not a valid pricing structure. Check the PricingStructure component state.');
    });

    let returnVal = prices;
    if(pricingStructure === 'ma_forge' || pricingStructure === 'ma_laminar' || pricingStructure === 'la_standard' || pricingStructure === 'standard' || pricingStructure === 'ichoosr_2026'){
      returnVal = prices.filter(price => price.system_type === systemType);
      // If price not found for this system type (equipment for example) do it with no system type
      if(!returnVal || returnVal.length === 0)
        returnVal = prices.filter(price => price.system_type === null)
    }

    if(!returnVal || returnVal.length === 0){
      let errorMessage = 'No price found for ';
      if(type === 'labor' || type === 'circuit')
        errorMessage = errorMessage + 'labor id '+item?.labor_id;
      else if(type === 'equipment')
        errorMessage = errorMessage + 'equipment id '+item?.equipment_id;
      else if(type === 'mp')
        errorMessage = errorMessage + 'maintenance plan id '+item?.maintenance_plan_id;
      else
        errorMessage = errorMessage + 'line item '+JSON.stringify(item);
      throw new Error(errorMessage);
    }

    return returnVal;
  }
  function getPrice(prices,type,item){
    let price = getPrices(prices,type,item);
    
    if(Array.isArray(price) && price.length > 1)
      throw new Error('duplicate prices found - ids: '+JSON.stringify(price.map(row => row.id))+'Pricing structure: '+pricingStructure);
    else
      return price[0].price;
  }
  function getCircuitPrice(prices,item){
    prices = getPrices(prices,'circuit',item);
    // Circuits have 4 prices each - base, per-ft-easy, per-ft-difficult, and first-circuit-adder
    if(Array.isArray(prices) && prices.length > 4)
      throw new Error('duplicate prices found - ids: '+JSON.stringify(price.map(row => row.id))+'Pricing structure: '+pricingStructure);

    let base = prices.find(price => price.circuit_price_type === 'base');
    let baseCost = Number(base?.price);
    let maxCost = Number(base?.circuit_price_limit);

    if((!baseCost && baseCost !== 0) || typeof baseCost !== 'number')
      throw new Error('no valid base price found for circuit - labor_id '+item.labor_id+'. Price found: '+baseCost+'. Type: '+typeof baseCost);
    if((!maxCost && maxCost !== 0) || typeof maxCost !== 'number')
      throw new Error(`no valid max price found for circuit - labor_id ${item.labor_id}. Price found: ${maxCost}. Type: ${typeof maxCost}`);
    
    let difficult = item.additional_data?.electrical?.difficult;
    let perFtCost;
    if(difficult)
      perFtCost = Number(prices.find(price => price.circuit_price_type === 'per-ft-difficult')?.price);
    else
      perFtCost = Number(prices.find(price => price.circuit_price_type === 'per-ft-easy')?.price);
    if((!perFtCost && perFtCost !== 0) || typeof perFtCost !== 'number')
      throw new Error(`no valid ${difficult ? 'per-ft-difficult' : 'per-ft-easy'} cost found for circuit - labor_id ${item.labor_id}. Price found: ${perFtCost}. Type: ${typeof perFtCost}`);
    
    let length = Number(item.additional_data?.electrical?.circuit_length);
    if((!length && length !== 0) || typeof length !== 'number')
      throw new Error(`no valid length defined for circuit - labor_id ${item.labor_id}. Length: ${length}. Type: ${typeof length}`);

    let firstCircuitAdder = 0;
    if(isFirstCircuit){
      firstCircuitAdder = Number(prices.find(price => price.circuit_price_type === 'first-circuit-adder')?.price);
      if((!firstCircuitAdder && firstCircuitAdder !== 0) || typeof firstCircuitAdder !== 'number')
        throw new Error(`no valid first circuit adder found for circuit - labor_id ${item.labor_id}. Price found: ${firstCircuitAdder}. Type: ${typeof firstCircuitAdder}`);
      isFirstCircuit = false;
    }

    return firstCircuitAdder + Math.min(baseCost + perFtCost * length, maxCost);
  }
  function getLaborPrice(item){
    let prices = pricesData.filter(price => price.labor_id === item.labor_id);
    let labor = Object.values(laborData).find(labor => labor.id === item.labor_id);
    if(labor.subcategory === 'circuit')
      return getCircuitPrice(prices,item);
    else
      return getPrice(prices,'labor',item);
  }
  function getEquipmentPrice(item){
    let prices = pricesData.filter(price => price.equipment_id === item.equipment_id);
    return getPrice(prices,'equipment',item);
  }
  function getMpPrice(item){
    let prices = pricesData.filter(price => price.maintenance_plan_id === item.maintenance_plan_id);
    return getPrice(prices,'equipment',item);
  }

  console.log('Pricing line items... Structure: '+pricingStructure+' - System type: '+systemType);

  // Price line items & set other values
  let isFirstCircuit = true;
  lineItemArray.forEach(item => {
    try{
      // Find and set prices
      // TODO Change to only getting a price number
      let price;
      if(item.labor_id)
        price = getLaborPrice(item);
      else if(item.equipment_id)
        price = getEquipmentPrice(item);
      else if(item.maintenance_plan_id)
        price = getMpPrice(item);

      let qty = item.quantity ? item.quantity : 1;
      item.price_actual = price * qty;

    } catch (e){
      e.fail = false;
      errors.push(e);  
    }
  });

  return lineItemArray;
}

/**
 * ADDITIONAL SCOPE VARIABLES NEEDED:
* @param [Array] lineItems - REQUIRED - list of line items to price
* @param String pricingStructure - REQUIRED
* @param {Object} equipmentData - OPTIONAL from equipment_by_id trigger
* @param {Object} laborData - OPTIONAL from labor_by_id trigger
* */

/*** Run the program ***/

var errors = [];

var equipmentData;
var laborData;
if(!equipmentData || (equipmentData instanceof Object && Object.keys(equipmentData)?.length === 0)){
  equipmentData = await new Promise((resolve,reject) => {
    equipment_by_id.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
}
if(!laborData || (laborData instanceof Object && Object.keys(laborData)?.length === 0)){
  laborData = await new Promise((resolve,reject) => {
    labor_by_id.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
}
const pricesData = await new Promise((resolve,reject) => {
  prices_all.trigger({
    onSuccess:resolve,
    onFailure:reject
  });
});
const mpData = await new Promise((resolve,reject) => {
  maintenance_plans.trigger({
    onSuccess: resolve,
    onFailure: reject
  });
});

// check if this is group of line items (a system) is ducted, ductless, mixed, or null
const systemType = await new Promise((resolve,reject) => {
  getHvacSystemType.trigger({
    additionalScope: {
      lineItems: lineItems,
      equipmentData: equipmentData
    },
    onSuccess: resolve,
    onFailure: reject
  });
});


// Price the line items
let pricedLineItems = priceLineItems(lineItems,pricingStructure);

return {
  result: pricedLineItems,
  errors: errors
}