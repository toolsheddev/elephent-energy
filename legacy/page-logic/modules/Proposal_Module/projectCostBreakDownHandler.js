let systems = new_systems.data;

function filterArray(systems) {
  return systems.filter(item => item.system_type === 'water heater');
}

const wh = filterArray(systems);

await optionalSlideSelection.setValue(
  wh.length > 0 ? ['Water Heater Savings'] : []
);
await checkForWaterHeaterValue.setValue( wh.length > 0 ? ['Water Heater Savings'] : [])