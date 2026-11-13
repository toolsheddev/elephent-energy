/* ********* *
 * Functions *
 * ********* */
const REFRIGERANT_BALL_VALVE_LABOR_ID = 140;
const REFRIGERANT_BALL_VALVE_EQUIPMENT_IDS = [793, 792];
function getIndoorUnits(equipmentArray){
  let indoorUnits = equipmentArray?.filter(item => {
    let equipment = equipmentData[item.equipment_id];
    return item.equipment_id 
           && !item.labor_id
           && equipment 
           && ['AHU','Dual-Fuel Coil','Wall Head','Ceiling Cassette','Floor Head','Horizontal-Ducted Head'].includes(equipment.equipment_type);
  }).map(item => {
    return equipmentData[item.equipment_id];
  });
  if(!indoorUnits || indoorUnits.length === 0)
    return [];

  return indoorUnits;
};
function getOutdoorUnit(equipmentArray){
  let outdoorUnitResult = equipmentArray.find(unit => unit.equipment_id && equipmentData[unit.equipment_id]?.equipment_type === 'Condenser');
  let outdoorUnitId = outdoorUnitResult ? outdoorUnitResult.equipment_id : null;
  let outdoorUnit = equipmentData[outdoorUnitId];

  if(!outdoorUnit)
    return [];

  return outdoorUnit;
}

//input needs to be pre-filtered 
function indoorUnitSeries(indoorUnits){
  // throw error if indoor units are not all the same series
  let indoorSeries = null;
  indoorUnits.forEach(unit => {
    if(indoorSeries == null)
      indoorSeries = unit.model_series;
    else if(unit.model_series === indoorSeries)
      ;
    else
      throw new Error('All AHUs and heads must be of the same model series');
  });
  return indoorSeries;
};

// get additional equipment recursively
function getAdditionalEquipment(ids,equipmentData){
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
function specEquipment(lineItemArray){
   console.log('>>> specEquipment - Start');
  console.log('Input lineItemArray:', lineItemArray);
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

    // Auto-spec Refrigerant Ball Valves (ZFBV38 #793 + ZFBV14 #792) whenever the
    // "Refrigerant Ball Valve" install labor (#140) is added to a design.
    if(Number(li.labor_id) === REFRIGERANT_BALL_VALVE_LABOR_ID)
      result = result.concat(getAdditionalEquipment(REFRIGERANT_BALL_VALVE_EQUIPMENT_IDS, equipmentData));
  });


  // Spec branch boxes & joint pipes for multi-unit systems
  let indoorUnits = getIndoorUnits(result);
  let indoorSeries = indoorUnitSeries(indoorUnits);
  let outdoorUnitResult = lineItemArray.find(unit => unit.equipment_id && equipmentData[unit.equipment_id]?.equipment_type === 'Condenser');
  let outdoorUnitId = outdoorUnitResult ? outdoorUnitResult.equipment_id : null;
  let outdoorUnit = equipmentData[outdoorUnitId];
  if(indoorUnits.length > 1){

    // Add matching Refrigerant Adder only if >1 indoor unit
  //let refrigerantAdder = Object.values(equipmentData).find(eq =>
   // eq.equipment_name === "Refrigerant Adder" && eq.refrigerant === outdoorUnit.refrigerant
 // );
 // if (refrigerantAdder) {
  //  result.push({ equipment_id: refrigerantAdder.id });
  //}
    
    // no joints needed for matching M series units
    if(indoorSeries === 'M' && outdoorUnit.model_series === 'M');

    // branch boxes needed for M indoor with SM outdoor units
    else if(indoorSeries === 'M' && outdoorUnit.model_series === 'SM'){

      // Get circuit lengths for multiple branch boxes
      let bb1Data = {electrical: {}};
      let bb2Data = {electrical: {}};
      if(indoorUnits.length > 5){
        bb1Data.electrical.circuit_length = CircuitLengthBB1.value; 
        bb2Data.electrical.circuit_length = CircuitLengthBB2.value;
        bb1Data.electrical.difficult = CircuitDifficultBB1.value;
        bb2Data.electrical.difficult = CircuitDifficultBB2.value;

        if(bb1Data.electrical.circuit_length === null || bb1Data.electrical.circuit_length === undefined || bb2Data.electrical.circuit_length === null || bb2Data.electrical.circuit_length === undefined)
          throw new Error('must provide circuit length for multiple branch boxes');
      }

      console.log('spec\'ing branch box(es)');
      if(indoorUnits.length <= 3) // 3 port branch box
        result.push({equipment_id : bb3_id});
      else if(indoorUnits.length <= 5) // 5 port branch box
        result.push({equipment_id : bb5_id});
      else if(indoorUnits.length == 6) // 2x 3 port branch box + tee
        result.push({equipment_id : bb3_id, additional_data: bb1Data},{equipment_id : bb3_id, additional_data: bb2Data},{equipment_id : msdd_id});
      else if(indoorUnits.length <= 8) // 3 port & 5 port branch box + tee
        result.push({equipment_id : bb5_id, additional_data: bb1Data},{equipment_id : bb3_id, additional_data: bb2Data},{equipment_id : msdd_id});
      else if(indoorUnits.length <= 10) // 2x 5 port branch box + tee
        result.push({equipment_id : bb5_id, additional_data: bb1Data},{equipment_id : bb5_id, additional_data: bb2Data},{equipment_id : msdd_id});
// get rid of compatibility checks
      //else
      //  throw new Error('too many M series indoor units. Count: '+indoorUnits.length);
    }
    // branch joints/headers needed for S indoor with SM outdoor units
    else if(indoorSeries === 'S' && outdoorUnit.model_series === 'SM') {
      console.log('spec\'ing branch joints');
      if(indoorUnits.length == 2)
        result.push({equipment_id : cmy62_id});
      else if(indoorUnits.length <= 4)
        result.push({equipment_id : cmy64_id});
      else if(indoorUnits.length <= 8)
        result.push({equipment_id : cmy68_id});
// get rid of compatibility checks      
      //else
      //  throw new Error('too many S series indoor units. Count: '+indoorUnits.length);
    // no other combinations of multiple indoor with one outdoor unit are allowed
    } 
// get rid of compatibility checks    
    //else {
    //  throw new Error('Invalid combination: '+indoorUnits.length+' '+indoorSeries+' series indoor units with '+outdoorUnit.model_series+' series outdoor unit');
    //}
  }

  // add circuits
  let circuitLaborArray = Object.values(laborData).filter(row => row.subcategory === 'circuit');
  result.forEach(item => {
    if(!item.equipment_id || item.labor_id)
      return
    let equipment = equipmentData[item.equipment_id];
    //console.log('Processing circuits for '+equipment?.model_number);
    
    if(equipment?.electrical_requirements && Object.keys(equipment.electrical_requirements).length > 0){
      // execute conditions & get circuit data
      let circuitReq = equipment.electrical_requirements;
      //console.log('Circuit req: ');
      //console.log(circuitReq);
      //console.log('equipment:');
      //console.log(equipment);
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
          //console.log('Match Count: '+matchCount);
          //console.log('Operand: '+condition.operand);

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

        //console.log('Condition met? '+conditionMet);
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
      let labor = laborData[item.labor_id];
      item.line_item_type = 'labor';
      item.description = labor.name;
    } else if(item.equipment_id){
      item.line_item_type = 'equipment';
      let equipment = equipmentData[item.equipment_id];
      item.description = (equipment.model_number ? equipment.model_number+' | ' : '') + equipment.equipment_name;
      item.equipment_provider = equipment.provider;
    }
  });

  return result;
}




/*****************
 * Trigger Logic *
 *****************/

/* Gather input data */
var equipmentData;
if(!equipmentData && equipment_by_id.data)
  equipmentData = equipment_by_id.data;
else if(!equipmentData){
  equipmentData = await new Promise((resolve,reject) => {
    equipment_by_id.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
}

var laborData;
if(!laborData && labor_by_id.data)
  laborData = labor_by_id.data;
else if(!laborData){
  laborData = await new Promise((resolve,reject) => {
    labor_by_id.trigger({
      onSuccess: resolve,
      onFailure: reject
    });
  });
}

var lineItems;
if(!lineItems || (Array.isArray(lineItems) && lineItems.length === 0))
  throw new Error('Some line items must be provided to specEquipment')

let equipmentDataArray = Object.values(equipmentData);
const bb3_id = equipmentDataArray.find(row => row.model_number === 'PAC-MKA32BC').id;
const bb5_id = equipmentDataArray.find(row => row.model_number === 'PAC-MKA52BC').id;
const cmy62_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y62-G-E').id;
const cmy64_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y64-G-E').id;
const cmy68_id = equipmentDataArray.find(row => row.model_number === 'CMY-Y68-G-E').id;
const msdd_id = equipmentDataArray.find(row => row.model_number === 'MSDD-50AR-E').id;



return specEquipment(lineItems);
