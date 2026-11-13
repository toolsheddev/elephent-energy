function specIncentives(lineItems) {

  function matchEligibility(incentive){

    logThisIncentive = true;

    if(logThisIncentive){
      console.log('matching eligibility for incentive:')
      console.log(incentive)
    }

    // first check system type
    if(incentive.system_type !== system.system_type){
      if(logThisIncentive)
        console.log('Wrong system type - skipping this incentive')
      return null;
    }

    // then check eligibility JSON
    let eligibilities = Object.values(incentive.incentive_criteria);
    let isElegible = eligibilities.find(option => {
      //ALL conditions must be met

      // If no criteria, return a match
      if(!option.criteria || Object.keys(option.criteria).length === 0){
        return true;
      }

      // If max amount is zero, return no match (not-eligible criteria)
      if(option.criteria?.amount?.max_amount === 0)
        return false;

      let criteriaTypes = Object.keys(option.criteria);

      let returnValue = criteriaTypes.reduce((acc,key) => {

        let criteria = option.criteria[key];
        let isMet = false;
        if(key === 'equipment'){
          // go through equipment - if any matches the criteria, return true
          isMet = equipmentArray.reduce((acc2, equipment) => {
            return acc2 || checkCriteria(criteria, equipment,logThisIncentive);
          },false);
        } else if(key === 'labor'){
          // go through labor - if any matches the criteria, return true
          isMet = laborArray.reduce((acc2, labor) => {
            return acc2 || checkCriteria(criteria, labor,logThisIncentive);
          },false);
        } else if(key === 'home' || key === 'house'){
          isMet = startTrigger.data.isArbitrary ? true : checkCriteria(criteria, startTrigger.data.house,logThisIncentive);
        } else if(key === 'customer'){
          isMet = startTrigger.data.isArbitrary ? true : checkCriteria(criteria, startTrigger.data.customer,logThisIncentive);
         } else if(key === 'existing_system'){
          if (startTrigger.data.isArbitrary) {
            isMet = true; // Arbitrary checker ke liye bypass
          } else {
  let systemTypeDetail;
  
  // Check if criteria has nested cooling or heating
  const hasCoolingCriteria = criteria.cooling && typeof criteria.cooling === 'object';
  const hasHeatingCriteria = criteria.heating && typeof criteria.heating === 'object';
  
  if(hasCoolingCriteria && hasHeatingCriteria) {
    // BOTH heating and cooling need to be checked
    // Merge both data objects
    systemTypeDetail = {
      cooling: existingSystem?.system_type_detail?.cooling || {},
      heating: existingSystem?.system_type_detail?.heating || {}
    };
    
    if(logThisIncentive)
      console.log('Checking both cooling and heating:', systemTypeDetail);
  } 
  else if(hasCoolingCriteria) {
    // Only cooling
    systemTypeDetail = existingSystem?.system_type_detail?.cooling;
    
    if(logThisIncentive)
      console.log('Checking cooling only:', systemTypeDetail);
  } 
  else if(hasHeatingCriteria) {
    // Only heating
    systemTypeDetail = existingSystem?.system_type_detail?.heating;
    
    if(logThisIncentive)
      console.log('Checking heating only:', systemTypeDetail);
  } 
  else {
    // ORIGINAL LOGIC: No nested cooling/heating in criteria
    if(existingSystem && existingSystem.system_type_detail && Object.keys(existingSystem.system_type_detail).includes('heating'))
      systemTypeDetail = existingSystem.system_type_detail.heating;
    else if(existingSystem && existingSystem.system_type_detail)
      systemTypeDetail = existingSystem.system_type_detail;
    
    if(logThisIncentive)
      console.log('Checking existing_system (default):', systemTypeDetail);
  }
  
  isMet = checkCriteria(criteria, systemTypeDetail, logThisIncentive);
          }
        //  } else if(key === 'existing_system'){
        //    // get system type detail of existing system. If HVAC, heating/cooling is nested, otherwise it's not
        //    let systemTypeDetail;
        //    if(existingSystem && existingSystem.system_type_detail && Object.keys(existingSystem.system_type_detail).includes('heating'))
        //      systemTypeDetail = existingSystem.system_type_detail.heating;
            
        //    else if(existingSystem && existingSystem.system_type_detail)
        //      systemTypeDetail = existingSystem.system_type_detail;
        //    // do the check
        //    isMet = checkCriteria(criteria, systemTypeDetail,logThisIncentive);
        
        } else if(key === 'system'){
          isMet = checkCriteria(criteria,system,logThisIncentive);
        } else if(key === 'ahri'){
          isMet = checkCriteria(criteria,ahriRecord,logThisIncentive);
        } else {
          errors.push(new Error('Invalid incentive criteria key: '+key));
          isMet = false;
        }

        if(acc === null)
          return isMet;
        else
          return isMet && acc;
      },null);

      return returnValue ? returnValue : false;
    });

    return isElegible;
  }
  function getActualAmount(incentive,matchedEligibility,fullInstallCost,electricalCost,furnaceCost,ahriRecord,isFinalRun){

    function calcAmount(matchedEligibility, multiplierTarget) {

      function isPowerOfTen(n) {

        return n > 0 && 10 ** Math.round(Math.log10(n)) === n;
      }

      let roundingPlace = matchedEligibility.amount.rounding_place;
      roundingPlace = roundingPlace ? roundingPlace : 0.01; // if not provided, round to nearest cent

      if (!isPowerOfTen(roundingPlace)) {
        throw new Error('rounding_place must be a power of 10');
      }

      let multiplied = Math.round(matchedEligibility.amount.multiplier_value * multiplierTarget / roundingPlace) * roundingPlace;

      let maxAmount = matchedEligibility.amount.max_amount;

      if(logThisIncentive){
        
        console.log('Incentive max: '+maxAmount);
        console.log('Incentive multiplier: '+matchedEligibility.amount.multiplier_value);
        console.log('Multiplier target: '+multiplierTarget);
      }

      if (maxAmount !== null && maxAmount !== undefined && multiplied !== null && multiplied !== undefined) {
          return Math.min(maxAmount, multiplied);
      } else if (maxAmount !== null && maxAmount !== undefined) {
          return maxAmount;
      } else if (multiplied !== null && multiplied !== undefined) {
          return multiplied;
      } else {
          throw Error('No valid amount for incentive ' + matchedEligibility);
      }
  }

    if(!matchedEligibility)
      return 0;

    let returnVal;
    if(matchedEligibility.amount.multiplier_type === 'full install')
      returnVal = Number(calcAmount(matchedEligibility,fullInstallCost));
    else if(matchedEligibility.amount.multiplier_type === 'electrical'){
      returnVal = Number(calcAmount(matchedEligibility,electricalCost));
    }
    else if(matchedEligibility.amount.multiplier_type === 'non-electrical'){
      returnVal = Number(calcAmount(matchedEligibility,nonElectricalCost));
    }
    else if(matchedEligibility.amount.multiplier_type === 'furnace cost'){
      returnVal = Number(calcAmount(matchedEligibility,furnaceCost));
    }
    else if(matchedEligibility.amount.multiplier_type === 'cooling tonnage rounded 2'){
      if(!ahriRecord)
        throw new Error('No AHRI record found - cannot calculate amount for incentive '+incentive.name);
      let coolBTU = ahriRecord.cooling_95;
      let coolTonsRounded = Math.round((coolBTU/12000 + Number.EPSILON) * 100) / 100;
      returnVal = Number(calcAmount(matchedEligibility,coolTonsRounded));
    }
    else if(matchedEligibility.amount.multiplier_type === 'cooling tonnage rounded down'){
      if(!ahriRecord)
        throw new Error('No AHRI record found - cannot calculate amount for incentive '+incentive.name);
      let coolBTU = ahriRecord.cooling_95; 
      let coolTonsRounded = Math.floor(coolBTU / 12000); 
      returnVal = Number(calcAmount(matchedEligibility, coolTonsRounded)); 
    }
    else if(matchedEligibility.amount.multiplier_type === 'heating tonnage rounded 2'){
      if(!ahriRecord)
        throw new Error('No AHRI record found - cannot calculate amount for incentive '+incentive.name);
      let heatBTU = ahriRecord.heating_5;
      let heatTonsRounded = Math.round((heatBTU/12000 + Number.EPSILON) * 100) / 100;
      returnVal = Number(calcAmount(matchedEligibility,heatTonsRounded));
    }

    else if(matchedEligibility.amount.multiplier_type === 'heating47 tonnage rounded 1'){
      if(!ahriRecord)
        throw new Error('No AHRI record found - cannot calculate amount for incentive '+incentive.name);
      let heatBTU = ahriRecord.heating_47;
      let heatTonsRounded = Math.round((heatBTU/12000 + Number.EPSILON) * 10) / 10;
      returnVal = Number(calcAmount(matchedEligibility,heatTonsRounded));
    }
      
    else if(matchedEligibility.amount.multiplier_type === 'heating tonnage rounded down'){
      if(!ahriRecord)
        throw new Error('No AHRI record found - cannot calculate amount for incentive '+incentive.name);
      let heatBTU = ahriRecord.heating_47; 
      let heatTonsRounded = Math.floor(heatBTU / 12000); 
      returnVal = Number(calcAmount(matchedEligibility, heatTonsRounded)); 
    }
    else if (matchedEligibility.amount.multiplier_type === 'cooling tonnage rounded half ton') {
  if (!ahriRecord) {
    throw new Error('No AHRI record found - cannot calculate amount for incentive ' + incentive.name);
  }
  let coolBTU = ahriRecord.cooling_95;
  // Divide BTU by 12,000 to get tons, then round to nearest 0.5 (24,000 BTU/ton)
  let coolTonsRounded = Math.round((coolBTU / 12000) * 2) / 2;
  returnVal = Number(calcAmount(matchedEligibility, coolTonsRounded));
}
    else if(matchedEligibility.amount.multiplier_type === 'tax-federal' && !isFinalRun)
      throw Error('tax-federal multiplier type is only valid for tax credits. This incentive: '+incentive.name);
    else if(matchedEligibility.amount.multiplier_type === 'tax-federal' && isFinalRun)
      returnVal = Number(calcAmount(matchedEligibility,fullInstallCost + taxAffectingIncentives));
    else if(matchedEligibility.amount.multiplier_type === '')
      returnVal = 0;
    else
      throw Error('Invalid multiplier type '+matchedEligibility.amount.multiplier_type+' for incentive: '+incentive.name)

    if(logThisIncentive)
      console.log('Incentive amount: '+returnVal);
    
    return returnVal;
  }

  /**
   * Function to check criteria - calls checkCriterion on each onetas 
   * @param {Object} criteria - key = field on data, value = value to check
   * @param {Object} data
   * @returns {boolean}
   */
  function checkCriteria(criteria, data,logThisIncentive) {

    function getInnerValue(obj, path) {
      let keys = path.split('.');
      let current = obj;

      if(!current)
        return;

      for (let key of keys) {
          if (current[key] === undefined) {
              return undefined; // Or any fallback value you prefer
          }
          current = current[key];
      }

      return current;
    }

    let allMet = Object.keys(criteria).reduce((acc, criterionKey) => {
      const checkValue = criteria[criterionKey];
      const dataValue = getInnerValue(data,criterionKey);
      if (data && dataValue === undefined){
        // TODO figure out a better way to do this error that doesn't throw when the value it's looking for is an inner JSON value that doesn't exist
        //throw new Error(`${criterionKey} is not a valid criterion for data ${JSON.stringify(data)}`);
      }

      if(logThisIncentive){
        console.log('Checking criterion: '+criterionKey);
      }
      
      let conditionMet;

      // if both values are objects, recurse, else do the check
      if (typeof checkValue === 'object' && !Array.isArray(checkValue)) {
        if (typeof dataValue === 'object' && !Array.isArray(dataValue))
          conditionMet = checkCriteria(checkValue, dataValue);
        else
          conditionMet = false;
      } else {
        conditionMet = checkCriterion(checkValue, dataValue);
      }
      // accumulate and return
      if (acc === null)
        return conditionMet;
      else
        return conditionMet && acc;
    }, null);
    if(logThisIncentive){
      console.log('All criteria met? '+allMet);
    }
    return allMet;
  }

  /**
   * Function to check one criterion
   * @param {*} checkValue - value to check
   * @param {*} dataValue - value from data
   * @returns {boolean}
   */
  function checkCriterion(checkValue, dataValue) {

  if (!Array.isArray(checkValue) && Array.isArray(dataValue) && dataValue.length === 1)
    dataValue = dataValue[0];

  let isMet = false;

  if (typeof checkValue === 'string') {
    const regex = /^(>=|>|<=|<|==|=)/;
    const operator = checkValue.match(regex);

    // Get the remainder after operator
    const remainder = operator ? checkValue.replace(regex, '').trim() : '';

    // Only treat as mathematical operator IF remainder is a pure number (no '%', letters, etc.)
    if (operator && remainder !== '' && !isNaN(Number(remainder))) {
      const strippedValue = Number(remainder);
      const numericDataValue = Number(dataValue);

      switch (operator[0]) { 
        case '>=': isMet = numericDataValue >= strippedValue; break;
        case '>':  isMet = numericDataValue > strippedValue;  break;
        case '<=': isMet = numericDataValue <= strippedValue; break;
        case '<':  isMet = numericDataValue < strippedValue;  break;
        case '==':
        case '=':  isMet = numericDataValue == strippedValue; break;
      }
    } else {
      // LITERAL TEXT COMPARISON (Handles "<50%" === "<50%")
      isMet = String(dataValue).trim() === String(checkValue).trim();
    }

    if (logThisIncentive) {
      console.log('Checking criterion. Expected: ' + checkValue + ', Actual: ' + dataValue + ', isMet: ' + isMet);
    }
  } 
  else if (typeof checkValue === 'boolean' || typeof checkValue === 'number') {
    isMet = dataValue == checkValue;
  }
  else if (Array.isArray(checkValue)) {
    isMet = dataValue == checkValue || checkValue.reduce((acc, value) => {
      return acc || checkCriterion(value, dataValue);
    }, false);
  } else {
    throw new Error(`${typeof checkValue} is an invalid criterion value. Value: ${checkValue}`);
  }

  return isMet;
}


  /*** Outer function logic ***/
  const permitsData = Array.isArray(permits?.data) ? permits.data : [];
  const allSystems = Array.isArray(getSystems?.data) ? getSystems.data : [];
  const electricalPermitSystemCount = allSystems.filter(s =>
  ['hvac', 'water heater', 'cooktop', 'panel'].includes(s.system_type) &&
  s.proposal_id === startTrigger.data.system.proposal_id
).length || 1;


  // get full install cost - aka sum of all line items
  let fullInstallCost = lineItems.reduce((acc, item) => {
    let price = Number(item.price_actual); // don't need item.margin_amount b/c there is a separate margin line item
    if (!isNaN(price) && item.line_item_type !== 'incentive') {
      return acc + price;
    }
    return acc;
  }, 0);
  console.log('fullInstallCost:')
  console.log(fullInstallCost)
  console.log(lineItems)

  // filter all relevant equipment records for use later
  let equipmentArray = lineItems.reduce((acc,item) => {
    let equipmentRecord = equipmentData[item.equipment_id];
    if(equipmentRecord)
      acc.push(equipmentRecord);
    return acc;
  },[]);

  // filter all relevant labor records for use later
  let laborArray = lineItems.reduce((acc,item) => {
    let laborRecord = laborData[item.labor_id];
    if(laborRecord)
      acc.push(laborRecord);
    return acc;
  },[]);

// split electrical permit evenly - divided by number of hvac, water heater, and cooktop systems
function getElectricalPermitShare() {
  const totalElectricalPermits = permitsData
    .filter(p => p.permit_type === 'electrical')
    .reduce((sum, p) => sum + Number(p.price_actual || 0), 0);

  return totalElectricalPermits / electricalPermitSystemCount;
}

  // get electrical upgrade cost - labor cost for anything electrical
let electricalCost = lineItems.reduce((acc, item) => {
  let price = Number(item.price_actual) + Number(item.margin_amount);
  let labor = laborArray.find(l => l.id === item.labor_id);

  if (
    !isNaN(price) &&
    item.line_item_type === 'labor' &&
    labor?.category === 'electrical'
  ) {
    return acc + price;
  }

  return acc;
}, 0);

// ADD this system’s share of electrical permits
electricalCost += getElectricalPermitShare();


// get permit cost for system
function getSystemPermitCost(systemType) {
  if (systemType === 'hvac') {
    return permitsData
      .filter(p => p.permit_type === 'hvac')
      .reduce((sum, p) => sum + Number(p.price_actual || 0), 0);
  }

  if (systemType === 'water heater') {
    return permitsData
      .filter(p => p.permit_type === 'plumbing')
      .reduce((sum, p) => sum + Number(p.price_actual || 0), 0);
  }

  return 0;
}

    // get non-electrical upgrade cost - labor cost for anything not electrical
let nonElectricalCost = lineItems.reduce((acc, item) => {
  let price = Number(item.price_actual) + Number(item.margin_amount);
  let labor = laborArray.find(l => l.id === item.labor_id);

  if (
    !isNaN(price) &&
    item.line_item_type !== 'incentive' &&
    item.line_item_type !== 'margin' &&
    labor?.category !== 'electrical'
  ) {
    return acc + price;
  }

  return acc;
}, 0);

nonElectricalCost += getSystemPermitCost(system.system_type);

// get furnace cost - equipment and labor items with 'furnace' in the description
let furnaceCost = lineItems.reduce((acc, item) => {
  let price = Number(item.price_actual) + Number(item.margin_amount || 0);
  let desc = item.description?.toLowerCase() || '';

  if (
    !isNaN(price) &&
    item.line_item_type !== 'incentive' &&
    item.line_item_type !== 'margin' &&
    desc.includes('furnace')
  ) {
    return acc + price;
  }

  return acc;
}, 0);


  // Filter out incentives not in effect, based on tentative install date
  let systemDate = system.rebate_effective_date ? new Date(system.rebate_effective_date) : 
    startTrigger.data.rebateEffectiveDate ? new Date(startTrigger.data.rebateEffectiveDate) : new Date();
  
  let filteredIncentives = Object.entries(incentivesData).reduce((acc, [key, incentive]) => {
    if ((!incentive.active_date || new Date(incentive.active_date) <= systemDate)
        && (!incentive.inactive_date || new Date(incentive.inactive_date) >= systemDate)) {
      acc[key] = incentive;
    }
    return acc;
  }, {});


  // For testing purposes
  let logThisIncentive;

  // go through incentives query, find the relevant ones, and return line items of incentives
  // skip tax credits the first run-through
let incentiveLineItems = [];
let taxAffectingIncentiveLineItems = [];

// Process non-tax-credit incentives
let tempIncentives = Object.values(filteredIncentives).filter(incentive => incentive.incentive_type !== 'tax credit')
  .map(incentive => {
    try {
      logThisIncentive = logAllIncentives || incentiveIdsToLog.includes(incentive.id);

      // Calculate actualAmount in advance for sorting
      let matchedEligibility = matchEligibility(incentive);
      if (matchedEligibility) {
        let actualAmount = getActualAmount(incentive, matchedEligibility, fullInstallCost, electricalCost, furnaceCost, ahriRecord, true);
        return { incentive, actualAmount, matchedEligibility }; // Keep matchedEligibility for reuse
      }
      return null; // Skip incentives with no matched eligibility
    } catch (error) {
      console.log(`Error calculating actualAmount for incentive ${incentive.id}: ${error.message}`);
      return null;
    }
  })
  .filter(item => item !== null) // Remove invalid entries
  .sort((a, b) => b.actualAmount - a.actualAmount) // Sort by descending actualAmount
  .reduce((incentives, { incentive, actualAmount, matchedEligibility }) => {
    try {
      let matchedLineItem = lineItems.find(
        item => item.incentive_id === incentive.id && item.line_item_type === 'incentive' && (item.description?.toLowerCase() === incentive.name?.toLowerCase())
      );
        console.log('matchedLineItem', matchedLineItem)
      
      // Get ALL matching limits for this incentive (not just first one)
      let matchingLimits = initializedLimits.filter(
        limit => Array.isArray(limit.incentive_ids) && limit.incentive_ids.includes(incentive.id)
      );

      // Sort limits: quantity limits (limit_number) FIRST, then amount limits
      matchingLimits.sort((a, b) => {
        const aHasNumber = a.limit_number !== undefined && a.limit_number !== null;
        const bHasNumber = b.limit_number !== undefined && b.limit_number !== null;
        
        // Quantity limits come first
        if (aHasNumber && !bHasNumber) return -1;
        if (!aHasNumber && bHasNumber) return 1;
        return 0;
      });

      // Apply ALL matching limits in priority order
      if (matchingLimits.length > 0 && actualAmount > 0) {
        for (let limit of matchingLimits) {
          console.log(
            `Processing limit for incentive: ${incentive.name} (${incentive.id})\n` +
            `Limit: ${limit.name}\n` +
            `Before Processing:\n` +
            `- Received Amount: ${limit.received_amount}\n` +
            `- Limit Amount: ${limit.limit_amount}\n` +
            `- Received Number: ${limit.received_number}\n` +
            `- Limit Number: ${limit.limit_number}\n` +
            `- Current actualAmount: ${actualAmount}`
          );

          // FIRST: Apply quantity limit (more restrictive)
          if (limit.limit_number !== undefined && limit.limit_number !== null) {
            if (limit.received_number >= limit.limit_number) {
              console.log(`Quantity limit reached for ${incentive.name} in limit: ${limit.name}. Setting amount to 0.`);
              actualAmount = 0;
              errors.push(
                new Error(
                  `Quantity limit reached for incentive ${incentive.name}: ${limit.description}.`
                )
              );
              break; // Stop checking further limits, amount is now 0
            } else if (actualAmount > 0) {
              limit.received_number += 1;
            }
          }

          // SECOND: Apply amount limit (if quantity limit didn't set amount to 0)
          if (actualAmount > 0 && limit.limit_amount !== undefined && limit.limit_amount !== null) {
            const remainingAmount = limit.limit_amount - limit.received_amount;
            if (actualAmount > remainingAmount) {
              console.log(`Amount limit reducing incentive ${incentive.name} from ${actualAmount} to ${remainingAmount} due to limit: ${limit.name}`);
              actualAmount = Math.max(0, remainingAmount);
              errors.push(
                new Error(
                  `Amount limit reached for incentive ${incentive.name}: ${limit.description}. Remaining amount: ${remainingAmount}`
                )
              );
            }
            limit.received_amount += actualAmount;
          }

          console.log(
            `After Processing Limit: ${limit.name}\n` +
            `- Updated Received Amount: ${limit.received_amount}\n` +
            `- Updated Received Number: ${limit.received_number}\n` +
            `- Remaining actualAmount: ${actualAmount}`
          );
          
          // If amount became 0, no need to check remaining limits
          if (actualAmount === 0) {
            break;
          }
        }
      }

      let newLineItem = {
        price_actual: -1 * actualAmount,
        line_item_type: 'incentive',
        incentive_id: incentive.id,
        incentive_recipient: incentive.recipient,
        description: incentive.name,
      };

      if (matchedLineItem && matchedLineItem.id && matchedLineItem.adjustment_reason) {
        newLineItem = matchedLineItem; // Preserve adjusted line items
      } else if (matchedLineItem && matchedLineItem.id) {
        newLineItem.id = matchedLineItem.id; // Deduplicate
      }

      if (logThisIncentive) {
        console.log('New incentive:', newLineItem);
      }

      if(incentive.affects_tax_credit)
          taxAffectingIncentiveLineItems.push(newLineItem);
      
      incentives.push(newLineItem);
      return incentives;
    } catch (error) {
      error.message = `Error processing criteria for incentive ${incentive.id}. Message: ${error.message}`;
      errors.push(error);
      return incentives;
    }
  }, []);

// Filter and concatenate the results
tempIncentives = tempIncentives.filter(item => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
incentiveLineItems = incentiveLineItems.concat(tempIncentives);

// Calculate tax-affecting incentives
let taxAffectingIncentives = taxAffectingIncentiveLineItems.reduce((total, item) => total + item?.price_actual, 0);

// Process tax credits
tempIncentives = Object.values(filteredIncentives)
  .filter(incentive => incentive.incentive_type === 'tax credit')
  .reduce((incentives, incentive) => {
    try {
      logThisIncentive = logAllIncentives || incentiveIdsToLog.includes(incentive.id);

      let matchedLineItem = lineItems.find(
        item => item.incentive_id === incentive.id && item.line_item_type === 'incentive' && (item.description?.toLowerCase() === incentive.name?.toLowerCase())
      );

      let matchedEligibility = matchEligibility(incentive);

      if (matchedEligibility) {
        let actualAmount = getActualAmount(incentive, matchedEligibility, fullInstallCost, electricalCost, furnaceCost, ahriRecord, true);

        // Get ALL matching limits for this tax credit
        let matchingLimits = initializedLimits.filter(
          limit => Array.isArray(limit.incentive_ids) && limit.incentive_ids.includes(incentive.id)
        );

        // Sort limits: quantity limits FIRST, then amount limits
        matchingLimits.sort((a, b) => {
          const aHasNumber = a.limit_number !== undefined && a.limit_number !== null;
          const bHasNumber = b.limit_number !== undefined && b.limit_number !== null;
          
          if (aHasNumber && !bHasNumber) return -1;
          if (!aHasNumber && bHasNumber) return 1;
          return 0;
        });

        // Apply ALL matching limits in priority order
        if (matchingLimits.length > 0 && actualAmount > 0) {
          for (let limit of matchingLimits) {
            console.log(
              `Processing limit for tax credit: ${incentive.name} (${incentive.id})\n` +
              `Limit: ${limit.name}\n` +
              `Before Processing:\n` +
              `- Received Amount: ${limit.received_amount}\n` +
              `- Limit Amount: ${limit.limit_amount}\n` +
              `- Received Number: ${limit.received_number}\n` +
              `- Limit Number: ${limit.limit_number}\n` +
              `- Current actualAmount: ${actualAmount}`
            );

            // FIRST: Apply quantity limit
            if (limit.limit_number !== undefined && limit.limit_number !== null) {
              if (limit.received_number >= limit.limit_number) {
                console.log(`Quantity limit reached for tax credit ${incentive.name} in limit: ${limit.name}. Setting amount to 0.`);
                actualAmount = 0;
                errors.push(
                  new Error(
                    `Quantity limit reached for tax credit ${incentive.name}: ${limit.description}.`
                  )
                );
                break;
              } else if (actualAmount > 0) {
                limit.received_number += 1;
              }
            }

            // SECOND: Apply amount limit
            if (actualAmount > 0 && limit.limit_amount !== undefined && limit.limit_amount !== null) {
              const remainingAmount = limit.limit_amount - limit.received_amount;
              if (actualAmount > remainingAmount) {
                console.log(`Amount limit reducing tax credit ${incentive.name} from ${actualAmount} to ${remainingAmount} due to limit: ${limit.name}`);
                actualAmount = Math.max(0, remainingAmount);
                errors.push(
                  new Error(
                    `Amount limit reached for tax credit ${incentive.name}: ${limit.description}. Remaining amount: ${remainingAmount}`
                  )
                );
              }
              limit.received_amount += actualAmount;
            }

            console.log(
              `After Processing Tax Credit Limit: ${limit.name}\n` +
              `- Updated Received Amount: ${limit.received_amount}\n` +
              `- Updated Received Number: ${limit.received_number}\n` +
              `- Remaining actualAmount: ${actualAmount}`
            );
            
            if (actualAmount === 0) {
              break;
            }
          }
        }

        let newLineItem = {
          price_actual: -1 * actualAmount,
          line_item_type: 'incentive',
          incentive_id: incentive.id,
          incentive_recipient: incentive.recipient,
          description: incentive.name,
        };

        if (matchedLineItem && matchedLineItem.id && matchedLineItem.adjustment_reason) {
          newLineItem = matchedLineItem;
        } else if (matchedLineItem && matchedLineItem.id) {
          newLineItem.id = matchedLineItem.id;
        }

        if (logThisIncentive) {
          console.log('New tax credit incentive:', newLineItem);
        }

        incentives.push(newLineItem);
      }

      return incentives;
    } catch (error) {
      error.message = `Error processing tax credit incentive ${incentive.id}. Message: ${error.message}`;
      errors.push(error);
      return incentives;
    }
  }, []);
  
// Concatenate the tax credit results
tempIncentives = tempIncentives.filter(item => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
incentiveLineItems = incentiveLineItems.concat(tempIncentives);

  // Apply financing fees
  // Apply financing fees
 let oldFees = lineItems.filter(item => item.description?.includes('Finance Charge'));
  tempIncentives = incentiveLineItems.reduce((acc,item) => {
    let incentive = filteredIncentives[item.incentive_id];
    if(incentive.finance_fee){
      let newFee = {
        price_actual: incentive.finance_fee,
        line_item_type: 'incentive',
        incentive_id: incentive.id,
        description: 'Finance Charge for '+incentive.name
      };
      let oldFee = oldFees.find(fee => fee.incentive_id === incentive.id);
      if(oldFee && oldFee.id && oldFee.adjustment_reason){
          newFee = oldFee;
        } // don't replace adjusted line items!
      else if(oldFee && oldFee.id)
        newFee.id = oldFee.id;
      acc.push(newFee);

    }
    return acc;
  },[]);
  tempIncentives = tempIncentives.filter(item => item != null && ((item.price_actual && item.price_actual !== 0) || item.id));
  if(tempIncentives.length > 0)
    incentiveLineItems = incentiveLineItems.concat(tempIncentives);


  // EnergySmart 50% Project Cost Cap
  try {
    const projectCostCap = fullInstallCost * 0.5;

  
    const energySmartItems = incentiveLineItems.filter(
      item => filteredIncentives[item.incentive_id]?.name?.includes('EnergySmart')
    );

    console.log('EnergySmartItems: ', energySmartItems);
    console.log('EnergySmartItems length: ', energySmartItems.length);
  
    if (energySmartItems.length > 0 && fullInstallCost > 0) {
      const nonEnergySmartTotal = incentiveLineItems
        .filter(item => !filteredIncentives[item.incentive_id]?.name?.includes('EnergySmart'))
        .reduce((acc, item) => acc + Math.abs(Number(item.price_actual) || 0), 0);
  
      console.log('EnergySmart 50% cap check:');
      console.log('fullInstallCost:', fullInstallCost);
      console.log('projectCostCap (50%):', projectCostCap);
      console.log('nonEnergySmartTotal:', nonEnergySmartTotal);
  
      if (nonEnergySmartTotal >= projectCostCap) {
        // Rule 2: eliminate all EnergySmart incentives
        console.log('Non-EnergySmart stack already >= 50% — eliminating all EnergySmart rebates');
        energySmartItems.forEach(item => {
          console.log(`Eliminating EnergySmart incentive: ${filteredIncentives[item.incentive_id]?.name}, was: ${item.price_actual}`);
          item.price_actual = 0;
        });
        errors.push(new Error(
          `All EnergySmart rebates eliminated: incentive stack already exceeds 50% of project cost ($${projectCostCap}) before EnergySmart rebates.`
        ));
      } else {
        // Rule 1: reduce proportionally if needed
        const remainingRoom = projectCostCap - nonEnergySmartTotal;
        const energySmartTotal = energySmartItems
          .reduce((acc, item) => acc + Math.abs(Number(item.price_actual) || 0), 0);
  
        console.log('remainingRoom:', remainingRoom);
        console.log('energySmartTotal:', energySmartTotal);
  
        if (energySmartTotal > remainingRoom && energySmartTotal > 0) {
          energySmartItems.forEach(item => {
            const originalAmount = Math.abs(Number(item.price_actual) || 0);
            const scaledAmount = Math.round((originalAmount / energySmartTotal) * remainingRoom);
            console.log(`Reducing EnergySmart incentive ${filteredIncentives[item.incentive_id]?.name} from ${originalAmount} to ${scaledAmount}`);
            item.price_actual = -1 * scaledAmount;
          });
          errors.push(new Error(
            `EnergySmart rebates reduced from $${energySmartTotal} to $${remainingRoom} to stay within 50% of project cost ($${projectCostCap}).`
          ));
        }
      }
    }
  } catch (capError) {
    // Never let the cap logic crash the workflow — log and continue
    console.log('Error in EnergySmart 50% cap calculation:', capError.message);
    errors.push(new Error('EnergySmart cap check failed silently: ' + capError.message));
  }

  return incentiveLineItems;
}


/**
 * ADDITIONAL SCOPE VARIABLES NEEDED:
* @param [Array] lineItems - REQUIRED - list of line items to price
* @param {Object} system - REQUIRED -system line items are being added to
* @param Integer ahriId - CONDITIONALLY OPTIONAL - required if ahriRecord not specified
* @param {Object} ahriRecord - CONDITIONALLY OPTIONAL - AHRI record - required if ahriId not specified
* @param {Object} equipmentData - OPTIONAL from equipment_by_id trigger
* @param {Object} laborData - OPTIONAL from labor_by_id trigger
* */

/*** Run the program ***/

const incentiveIdsToLog = JSON.parse(startTrigger.data.IncentiveIds);
if(!Array.isArray(incentiveIdsToLog))
  throw new Error('Incentive Ids to log must be an array literal');
else
  console.log('Incentive IDs to log: '+JSON.stringify(incentiveIdsToLog));
const logAllIncentives = startTrigger.data.LogAllIncentives;

var lineItems = startTrigger.data.lineItems;
if(!lineItems)
  throw new Error('lineItems not provided in additionalScope variable')

var ahriRecord = transformData.data.ahriRecord;
//  var ahriId = checkForAhriId.data;
//  if(!ahriRecord && (ahriId || system.ahri_id)){
//    ahriId = ahriId ? ahriId : system.ahri_id;
//    ahriRecord = await new Promise((resolve,reject) => {
//      one_ahri_id.trigger({
//        additionalScope: {
//          id: ahriId
//        },
//        onSuccess: resolve,
//        onFailure: reject
//      });
//    });
//  }
var errors = [];

var equipmentData = transformData.data.equipmentData;
var laborData = transformData.data.laborData;
var incentivesData = transformData.data.incentivesData;
//  var incentiveLimitsData = transformData.data.incentiveLimitsData; 
//  var incentivesForLimits = transformData.data.incentivesForLimits;

//  if(!equipmentData || (equipmentData instanceof Object && Object.keys(equipmentData)?.length === 0)){
//    equipmentData = await new Promise((resolve,reject) => {
//      equipment_by_id.trigger({
//        onSuccess: resolve,
//        onFailure: reject
//      });
//    });
//  }
//  if(!laborData || (laborData instanceof Object && Object.keys(laborData)?.length === 0)){
//    laborData = await new Promise((resolve,reject) => {
//      labor_by_id.trigger({
//        onSuccess: resolve,
//        onFailure: reject
//      });
//    });
//  }
//  const incentivesPromise = new Promise((resolve,reject) => {
//    incentives_by_id.trigger({
//      onSuccess: resolve,
//      onFailure: reject
//    });
//  });
//  const incentiveLimitsPromise = new Promise((resolve,reject) => {
//    incentive_limits.trigger({
//      onSuccess: resolve,
//      onFailure: reject
//    });
//  });

//  const incentivesForLimitsPromise = new Promise((resolve,reject) => {
//    incentives_for_limits.trigger({
//      onSuccess: resolve,
//      onFailure: reject
//    });
//  }); 
//  await Promise.all([incentivesPromise,incentiveLimitsPromise,incentivesForLimitsPromise])
//  .then(([gotIncentivesData,gotIncentiveLimitsData,gotIncentivesForLimits]) => {
//    incentivesData = gotIncentivesData;
//    incentiveLimitsData = gotIncentiveLimitsData;
//    incentivesForLimits = gotIncentivesForLimits;
//  });
let system = startTrigger.data.system;
let existingSystem;
if (system.system_type === 'cooktop') {
  existingSystem = {
    system_type: 'cooktop',
    system_status: 'active',
    system_type_detail: { fuel: "gas", system_type: "cooktop" }
  };
} else {
  existingSystem = Object.values(getSystems.data).find(oldSystem => {
    return (
      oldSystem.system_status === 'active' &&
      (
        (oldSystem.system_type === system.system_type && system.system_type !== 'cooktop') ||
        (oldSystem.system_type === 'other' && system.system_type === 'cooktop')
      )
    );
  });
}


let initializedLimits = getInitializedLimits.data;


lineItems = calculateMargin.data;

// Calculate incentives
console.log('Calculate Incentives')
console.log(lineItems)
let incentiveLineItems = specIncentives(lineItems);
console.log(lineItems)
console.log('incentiveLineItems', incentiveLineItems)
console.log('lineItems before removal', lineItems)
let oldIncentiveLineItems = lineItems.filter(item => item.line_item_type === 'incentive');
console.log('oldIncentiveLineItems', oldIncentiveLineItems);
// Remove any old incentives from lineItems and replace with new incentives
lineItems = lineItems.filter(item => item.line_item_type !== 'incentive');
console.log('lineItems after removal', lineItems)
lineItems = lineItems.concat(incentiveLineItems);
console.log('lineItems after removal and addition of new incentive line items', lineItems)

/* Remove any empty line items, as a protection */
lineItems = lineItems.filter(item => {
  return item && item instanceof Object && Object.keys(item) && Object.keys(item).length > 0;
});

/* Add a temporary ID for UI purposes */
let tempIdCounter = 1; // Start counter at 1

/* Add a unique temporary ID for UI purposes */
lineItems.forEach((item) => {
  item.temp_id = tempIdCounter++;
});

    //  let i_system_id = system.id;

    // Await the delete operation
    //  let res = await deleteOldIncentivesLineItems(i_system_id );
    console.log(errors)
    const transformedErrors = (errors || []).map(err => ({
    name: err.name,
    message: err.message,
    stack: err.stack
  }));
    console.log(transformedErrors)
    // Return after delete completes
    return {
      deletedIncentives: oldIncentiveLineItems,
      result: lineItems,
      errors: transformedErrors,
      existingSystem: existingSystem,
    };