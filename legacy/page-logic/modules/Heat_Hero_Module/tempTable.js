let temperatures = {{ hpOutputs.value.filter(item => item.model === hpSelector.value)[0].outputs}};

let deration = {{ deration.value }};
let setTemp = {{ setTemp.value }};
let btuDegHr = {{ sizing.data.sizing.method === 'cooling' ? sizing.data.sizing.output.cooling.btuHrDeg : sizing.data.sizing.output.heating.btuHrDeg }};

const sortedTemperatureOutputs = Object.entries(temperatures)
  .map(([temperature, output]) => ({
    temperature: Number(temperature),
    hp_output: Number((output * deration / 1000).toFixed(1)),
    heating_need: Number(((setTemp - temperature) * btuDegHr / 1000).toFixed(1))
  }))
  .sort((a, b) => a.temperature - b.temperature) // Sorting by the numeric temperature value
  .map((item, index) => ({ ...item, index }));

return sortedTemperatureOutputs;
