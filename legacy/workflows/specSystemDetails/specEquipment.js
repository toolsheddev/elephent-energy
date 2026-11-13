/* ********* *
 * Functions *
 * ********* */

function getIndoorUnits(equipmentArray){
  console.log('>>> getIndoorUnits - Start:', { equipmentArray });
  let indoorUnits = equipmentArray?.filter(item => {
    let equipment = equipmentData[item.equipment_id];
    return item.equipment_id 
           && !item.labor_id
           && equipment 
           && ['AHU','Dual-Fuel Coil','Wall Head','Ceiling Cassette','Floor Head','Horizontal-Ducted Head', 'furnace'].includes(equipment.equipment_type);
  }).map(item => {
    return equipmentData[item.equipment_id];
  });
  if(!indoorUnits || indoorUnits.length === 0)
    return [];

  return indoorUnits;
};

function getOutdoorUnit(equipmentArray){
  console.log('>>> getOutdoorUnit - Start:', { equipmentArray });
  let outdoorUnitResult = equipmentArray.find(unit => unit.equipment_id && equipmentData[unit.equipment_id]?.equipment_type === 'Condenser');
  let outdoorUnitId = outdoorUnitResult ? outdoorUnitResult.equipment_id : null;
  let outdoorUnit = equipmentData[outdoorUnitId];

  if(!outdoorUnit)
    return [];

  return outdoorUnit;
}

//input needs to be pre-filtered 
function indoorUnitSeries(indoorUnits){
   console.log('>>> indoorUnitSeries - Start');
  // throw error if indoor units are not all the same series
  let indoorSeries = null;
  indoorUnits.forEach(unit => {
    if(indoorSeries == null)
      indoorSeries = unit.model_series;
    else if(unit.model_series === indoorSeries)
      ;
    //else
      //throw new Error('All AHUs and heads must be of the same model series');
  });
  return indoorSeries;
};

// get additional equipment recursively
function getAdditionalEquipment(ids,equipmentData){
  console.log('>>> getAdditionalEquipment - Start');
  console.log('Input ids:', ids);
  console.log('Equipment data keys:', Object.keys(equipmentData));
  let additionalEquipment = [];
  if(!ids || ids.length === 0)
    return additionalEquipment;
  ids.forEach(id => {
    let equipment = equipmentData[id];
    additionalEquipment.push({equipment_id : id});
    if(equipment?.additional_equipment_ids?.length > 0)
      additionalEquipment = additionalEquipment.concat(getAdditionalEquipment(equipment?.additional_equipment_ids,equipmentData));
  });
  return [...additionalEquipment];
}

/**
 * Spec a line item and all other equipment and labor line items that need to be included with a piece of equipment, excluding circuits for now
 * @param {Object} lineItemArray
 * @param {integer} lineItemArray.equipment_id - id of equipment
 * @param {integer} lineItemArray.zone_index - index of ahu or mshp zone
 * @param {Object} lineItemArray.additional_data
 * @param {boolean} lineItemArray.additional_data.electrical.circuit_length
 * @param {Enum} lineItemArray.additional_data.electrical.termination_type - hardwired or plug?
 * Line items may have other additional_data parameters that are not required by this function
* */
function specEquipment(lineItemArray, CircuitDifficultBB2, CircuitDifficultBB1, CircuitLengthBB2, CircuitLengthBB1, isManualBBOverride){
  console.log("isManualBBOverride: ", isManualBBOverride)
  let result = [];

  lineItemArray.forEach(li => {
    let equipment = equipmentData[li.equipment_id];
    
    // add this piece of equipment
    result.push(li);

    // add install labor
    if(equipment && equipment.labor_id)
      result.push({labor_id : equipment.labor_id, equipment_id: equipment.id});

    // recursively add additional equipment - stand/pad, PAC-445, 24VAC transformer, etc
    result = result.concat(getAdditionalEquipment(equipment?.additional_equipment_ids,equipmentData));
  });

  // Spec branch boxes & joint pipes for multi-unit systems
  let indoorUnits = getIndoorUnits(result);
  let indoorSeries = indoorUnitSeries(indoorUnits);
  let outdoorUnitResult = lineItemArray.find(unit => unit.equipment_id && equipmentData[unit.equipment_id]?.equipment_type === 'Condenser');
  let outdoorUnitId = outdoorUnitResult ? outdoorUnitResult.equipment_id : null;
  let outdoorUnit = equipmentData[outdoorUnitId];

  if (indoorUnits.length > 1) {
    
    // 1. Calculate Branch Boxes First
    if (!isManualBBOverride) {
      if(outdoorUnit?.manufacturer === 'Mitsubishi'){
        // no joints needed for matching M series units
        if(indoorSeries === 'M' && outdoorUnit.model_series === 'M');

        // branch boxes needed for M indoor with SM outdoor units
        else if(indoorSeries === 'M' && outdoorUnit.model_series === 'SM'){

          // Get circuit lengths for multiple branch boxes
          let bb1Data = {electrical: {}};
          let bb2Data = {electrical: {}};
          if(indoorUnits.length > 5){
            bb1Data.electrical.circuit_length = CircuitLengthBB11 || 0; 
            bb2Data.electrical.circuit_length = CircuitLengthBB21 || 0;
            bb1Data.electrical.difficult = CircuitDifficultBB11 || false;
            bb2Data.electrical.difficult = CircuitDifficultBB21 || false;

            if(bb1Data.electrical.circuit_length === null || bb1Data.electrical.circuit_length === undefined || bb2Data.electrical.circuit_length === null || bb2Data.electrical.circuit_length === undefined)
              throw new Error('must provide circuit length for multiple branch boxes');
          }

          // Choose which branch boxes based on refrigerant
          let bb3_id;
          let bb5_id;
          if(outdoorUnit.refrigerant === 'R-410A'){
            bb3_id = bb3_410a_id;
            bb5_id = bb5_410a_id;
          } else if(outdoorUnit.refrigerant === 'R-454B') {
            bb3_id = bb3_454b_id
            bb5_id = bb5_454b_id;
          } else {
            throw new Error('Outdoor Unit does not have a valid refrigerant specified',outdoorUnit.model_number,outdoorUnit.refrigerant);
          }
          const joint_id = outdoorUnit.refrigerant === 'R-454B' ? msdd_454b_id : msdd_id;
          console.log('spec\'ing branch box(es)');
          if(indoorUnits.length <= 3) // 3 port branch box
            result.push({equipment_id : bb3_id});
          else if(indoorUnits.length <= 5) // 5 port branch box
            result.push({equipment_id : bb5_id});
          else if(indoorUnits.length == 6) // 2x 3 port branch box + tee
            result.push({equipment_id : bb3_id, additional_data: bb1Data},{equipment_id : bb3_id, additional_data: bb2Data},{equipment_id : joint_id});
          else if(indoorUnits.length <= 8) // 3 port & 5 port branch box + tee
            result.push({equipment_id : bb5_id, additional_data: bb1Data},{equipment_id : bb3_id, additional_data: bb2Data},{equipment_id : joint_id});
          else if(indoorUnits.length <= 10) // 2x 5 port branch box + tee
            result.push({equipment_id : bb5_id, additional_data: bb1Data},{equipment_id : bb5_id, additional_data: bb2Data},{equipment_id : joint_id});
          else
            throw new Error('too many M series indoor units. Count: '+indoorUnits.length);
        }
        // branch joints/headers needed for S indoor with SM outdoor units
        else if (indoorSeries === 'S' && outdoorUnit?.model_series === 'SM') {
          console.log("spec'ing branch joints");
          if (indoorUnits.length == 2)
            result.push({ equipment_id: cmy62_id });
          else if (indoorUnits.length <= 4)
            result.push({ equipment_id: cmy64_id });
          else if (indoorUnits.length <= 8)
            result.push({ equipment_id: cmy68_id });
          else
            throw new Error('too many S series indoor units. Count: ' + indoorUnits.length);

        // for all other multi-indoor combos, do nothing (no extra equipment, no error)
        } else {
          console.log(
            `No branch boxes or joints required for ${indoorUnits.length} ${indoorSeries || 'unknown'} series indoor units with ${outdoorUnit.model_series || 'unknown'} outdoor unit`
          );
        }
      }
    } else {
      console.log('Skipping automatic branch box calculation - manual override active');
    }

    // 2. Refrigerant Adder Logic (Evaluated after Branch Boxes are in result)
    const branchBoxIds = [bb3_410a_id, bb5_410a_id, bb3_454b_id, bb5_454b_id];
    
    // Check if any branch box exists in the system
    let hasBranchBox = result.some(li => {
      let eq = equipmentData[li.equipment_id];
      return eq && (
        branchBoxIds.includes(li.equipment_id) ||
        (eq.equipment_type && eq.equipment_type.toLowerCase().includes('branch box')) ||
        (eq.equipment_name && eq.equipment_name.toLowerCase().includes('branch box')) ||
        (li.additional_data && li.additional_data.branchBoxId)
      );
    });

    if (hasBranchBox) {
      let targetAdderName = indoorUnits.length > 3 ? "Refrigerant Adder >3 IDU" : "Refrigerant Adder";
      
      let refrigerantAdder = Object.values(equipmentData).find(eq =>
        eq.equipment_name === targetAdderName && eq.refrigerant === outdoorUnit.refrigerant
      );
      
      if (refrigerantAdder) {
        result.push({ equipment_id: refrigerantAdder.id });
        console.log ('Added Refrigerant:', targetAdderName, refrigerantAdder.id);
      } else {
        console.log ('Could not find matching equipment for:', targetAdderName);
      }
    } else {
      console.log('Skipping Refrigerant Adder: No branch boxes detected.');
    }
  }
   

  // add circuits
  let circuitLaborArray = Object.values(laborData1).filter(row => row.subcategory === 'circuit');
  result.forEach(item => {
    if(!item.equipment_id || item.labor_id)
      return
    let equipment = equipmentData[item.equipment_id];
    
    if(equipment?.electrical_requirements && Object.keys(equipment.electrical_requirements).length > 0){
      // execute conditions & get circuit data
      let circuitReq = equipment.electrical_requirements;
      let circuits = circuitReq.find(condition => {
        let conditionMet = false;

        console.log('Condition Type: '+condition.condition_type);
        if(condition.condition_type === 'item_count'){
          let matchCount = result.filter(row => {
            if(row.labor_id || row.incentive_id)
              return false;
            // check all conditions in condition.filter against the equipment record
            return Object.keys(condition.filter).every(key => {
              return condition.filter[key].every(innerKey => {
                return equipmentData[row.equipment_id] && 
                (equipmentData[row.equipment_id] ? equipmentData[row.equipment_id][key] : undefined) === innerKey;
              });
            });
          }).length;

          switch(condition.operand) {
            case '=':
              conditionMet = matchCount === condition.value;
              break;
            case '>=':
              conditionMet = matchCount >= condition.value;
              break;
            case '<=':
              conditionMet = matchCount <= condition.value;
              break;
          }

        } else if(condition.condition_type === 'none') {
          conditionMet = true;

        } else if(condition.condition_type){
          throw new Error('invalid electrical condition for '+equipment?.model_number+': condition type '+condition.condition_type+' is not valid');
        }

        return conditionMet;
      });
      circuits = circuits?.circuits;
      console.log('Circuits for: '+equipment?.model_number);
      console.log(circuits);

      // match the circuit labor and add to result
      if(circuits && Array.isArray(circuits)){
        circuits.forEach(circuitData => {
          let labor = circuitLaborArray.find(row => row.circuit_amps === circuitData.amperage && row.circuit_voltage === circuitData.voltage);
          let circuit = {labor_id : labor?.id, equipment_id : equipment?.id};
         if(circuit.labor_id){
            //add circuit data passed from the UI through the equipment line item
            circuit.additional_data = item.additional_data;
            result.push(circuit);
          } else
            throw new Error('Labor record not found for requested '+circuitData.amperage+'A '+circuitData.voltage+'V circuit');
        });
      }
    }
  });

  // Add item descriptions
  result.forEach((item) => {
    if(item.labor_id){
      let labor = laborData1[item.labor_id];
      
      if (labor) {
        item.line_item_type = 'labor';
        item.description = labor.name;
    }
    } else if(item.equipment_id){
      item.line_item_type = 'equipment';
      let equipment = equipmentData[item.equipment_id];
      if (equipment) {
        item.line_item_type = 'equipment';
        item.description = (equipment.model_number ? equipment.model_number + ' | ' : '') + equipment.equipment_name;
        item.equipment_provider = equipment.provider;
    }
    }
  });

  return result;
}




/*****************
 * Trigger Logic *
 *****************/

/* Gather input data */
var equipmentData = equipmentData1;
var laborData = laborData1;

var lineItems = lineItems1;
if(!lineItems1 || (Array.isArray(lineItems1) && lineItems.length === 0))
  throw new Error('Some line items must be provided to specEquipment')

let equipmentDataArray = Object.values(equipmentData);
const bb3_410a_id = equipmentDataArray.find(row => row.model_number === 'PAC-MKA32BC').id;
const bb5_410a_id = equipmentDataArray.find(row => row.model_number === 'PAC-MKA52BC').id;
const bb3_454b_id = equipmentDataArray.find(row => row.model_number === 'PAC-LMA30BC').id;
const bb5_454b_id = equipmentDataArray.find(row => row.model_number === 'PAC-LMA50BC').id;
const cmy62_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y62-G-E').id;
const cmy64_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y64-G-E').id;
const cmy68_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y68-G-E').id;
const msdd_id = equipmentDataArray.find(row => row.model_number === 'MSDD-50AR-E').id;
const msdd_454b_id = equipmentDataArray.find(row => row.model_number === 'MSDD-50AR2-E').id;
console.log(CircuitLengthBB11);
console.log(CircuitLengthBB21);
console.log("Calling with manual false");

return specEquipment(lineItems1, CircuitDifficultBB21, CircuitDifficultBB11, CircuitLengthBB21, CircuitLengthBB11, isManualOverride);