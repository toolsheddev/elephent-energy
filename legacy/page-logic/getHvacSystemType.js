function getHvacSystemType(lineItems,equipmentData){

  let equipmentArray = lineItems.filter(item => item.line_item_type === 'equipment');

  let type = equipmentArray.reduce((type,item) => {
    if(item.equipment_id && !item.labor_id && !item.incentive_id){
      let equipment = equipmentData[item.equipment_id];
      console.log('Ducting Type: '+type);
      console.log('Equipment: '+equipment.equipment_type+' - '+equipment.model_number)

      if(equipment.equipment_type === 'AHU' 
        || equipment.equipment_type == 'Dual-Fuel Coil' 
        || equipment.equipment_type === 'Horizontal-Ducted Head'){
        if(type === 'ducted' || type === null)
          return 'ducted';
        else if(type === 'mixed')
          return 'mixed';
        else if(type === 'ductless')
          return 'mixed';
      } else if(equipment.equipment_type === 'Ceiling Cassette' 
        || equipment.equipment_type === 'Floor Head'
        || equipment.equipment_type === 'Wall Head'){
        if(type === null)
          return 'ductless';
        else if(type === 'ductless' || type === 'mixed')
          return type;
        else if(type === 'ducted')
          return 'mixed'
      } else {
        return type;
      }
    } else {
      return type;
    }
  },null);

  console.log('Ducted/Ductless/Mixed: '+type);
  return type;
}

var lineItems;
if(!lineItems)
  throw new Error('lineItems not provided through additionalScope');
var equipmentData;
if(!equipmentData)
  throw new Error('equipmentData not provided through additionalScope');

return getHvacSystemType(lineItems,equipmentData);