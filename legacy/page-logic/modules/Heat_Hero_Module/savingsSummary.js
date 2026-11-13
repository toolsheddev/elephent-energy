let savings = {{ newSavings.data }};
let hp = {"savings_15": Math.round(savings.heating.heat_pump.cost + savings.cooling.heat_pump.cost - (savings.heating.current.cost + savings.cooling.current.cost)) , 
          "savings_carbon": Math.round(savings.heating.heat_pump.footprint + savings.cooling.heat_pump.footprint - (savings.heating.current.footprint + savings.cooling.current.footprint)), 
          "percent_reduction": ((savings.heating.current.footprint + savings.cooling.current.footprint) > 0 ? (savings.heating.heat_pump.footprint + savings.cooling.heat_pump.footprint - (savings.heating.current.footprint + savings.cooling.current.footprint))/
(savings.heating.current.footprint + savings.cooling.current.footprint) : null).toFixed(2)};

let wh = {"savings_15": Math.round(savings.water_heating.heat_pump.cost - savings.water_heating.current.cost), 
          "savings_carbon": Math.round(savings.water_heating.heat_pump.footprint - savings.water_heating.current.footprint), 
          "percent_reduction": (savings.water_heating.current.footprint > 0 ? (savings.water_heating.heat_pump.footprint - savings.water_heating.current.footprint)/savings.water_heating.current.footprint : null).toFixed(2)};

let both = {"savings_15": Math.round(savings.heating.heat_pump.cost + savings.cooling.heat_pump.cost + savings.water_heating.heat_pump.cost - (savings.heating.current.cost + savings.cooling.current.cost + savings.water_heating.current.cost)), 
          "savings_carbon": Math.round(savings.heating.heat_pump.footprint + savings.cooling.heat_pump.footprint + savings.water_heating.heat_pump.footprint - (savings.heating.current.footprint + savings.cooling.current.footprint + savings.water_heating.current.footprint)), 
          "percent_reduction": ((savings.heating.current.footprint + savings.cooling.current.footprint + savings.water_heating.current.footprint) > 0 ? (savings.heating.heat_pump.footprint + savings.cooling.heat_pump.footprint + savings.water_heating.heat_pump.footprint - (savings.heating.current.footprint + savings.cooling.current.footprint + savings.water_heating.current.footprint))/(savings.heating.current.footprint + savings.cooling.current.footprint + savings.water_heating.current.footprint) : null).toFixed(2)};


return {hp: hp, wh: wh, both: both};