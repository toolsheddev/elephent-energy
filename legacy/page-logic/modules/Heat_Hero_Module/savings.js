const data = {{forecast.data}};
let gasFootprint = 12.08; // lbs CO2 per therm
let elecFootprint = 0.86; // lbs CO2 per KWh

const formatted = {
  heating: {
    current: { 
      cost: data.reduce((total, current) => total + current.heatingCost, 0),
      footprint: data.reduce((total, current) => total + current.heatingLoadTh, 0) * gasFootprint,
      consumption: data.reduce((total, current) => total + current.heatingLoadTh, 0)
    },
    heat_pump: {
      cost: data.reduce((total, current) => total + current.heatingCostHP, 0),
      footprint: data.reduce((total, current) => total + current.heatingLoadHP, 0) * elecFootprint,
      consumption: data.reduce((total, current) => total + current.heatingLoadHP, 0)
    }},
  cooling: {
    current: { 
      cost: data.reduce((total, current) => total + current.coolingCost, 0),
      footprint: data.reduce((total, current) => total + current.coolingLoadKWh, 0) * elecFootprint,
      consumption: data.reduce((total, current) => total + current.coolingLoadKWh, 0)
    },
    heat_pump: {
      cost: data.reduce((total, current) => total + current.coolingCostHP, 0),
      footprint: data.reduce((total, current) => total + current.coolingLoadHP, 0) * elecFootprint,
      consumption: data.reduce((total, current) => total + current.coolingLoadHP, 0)
    }},
  water_heating: {
    current: { 
      cost: data.reduce((total, current) => total + current.whCost, 0),
      footprint: data.reduce((total, current) => total + current.whLoadTh, 0) * gasFootprint,
      consumption: data.reduce((total, current) => total + current.whLoadTh, 0)
    },
    heat_pump: {
      cost: data.reduce((total, current) => total + current.whCostHPWH, 0),
      footprint: data.reduce((total, current) => total + current.whLoadHPWH, 0) * elecFootprint,
      consumption: data.reduce((total, current) => total + current.whLoadHPWH, 0)
    }}
};

return formatted;