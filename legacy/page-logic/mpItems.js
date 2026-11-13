const systems = {{ mpSystems.selectedItems }};
const systemIds = systems.map(s => s.id);
const lineItems = {{line_items.data}}.filter(item => {
  return systemIds.includes(item.system_id);
});

const equipment = lineItems.filter(item => item.line_item_type === 'equipment').map(item => {{equipment.data}}.find(equip => equip.id === item.equipment_id));

// Equipment types to categorize as ahu
let ahuTypes = ['AHU','Dual-Fuel Coil','Horizontal-Ducted Head'];
let headTypes = ['Ceiling Cassette','Floor Head','Wall Head'];

let returnValue = {};
equipment.forEach(equip => {
  let type;
  if(ahuTypes.includes(equip.equipment_type))
    type = 'ahus';
  else if(headTypes.includes(equip.equipment_type))
    type = 'heads';
  else if(equip.equipment_type === 'Condenser')
    type = 'condensers';
  else if(equip.equipment_type === 'HPWH')
    type = 'hpwhs';
  else if(equip.equipment_type === 'ERV')
    type = 'ervs';
  
  if(type && returnValue[type])
    returnValue[type].push(equip)
  else if(type)
    returnValue[type] = [equip];
})
return returnValue;


/** 
Accessory
AHU
Branch Box
Header
Ceiling Cassette
Condenser
Dual-Fuel Coil
Electrical
ERV
EV Charger
Floor Head
Heat Kit
Horizontal-Ducted Head
HPWH
Humidifier
Thermostat
Thermostat Accessory
Wall Head
 **/
