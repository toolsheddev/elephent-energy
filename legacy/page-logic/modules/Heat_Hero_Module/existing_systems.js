const systems = {{ systems.data}};

const hvac = systems.filter(system => system.system_type === 'hvac');
const water_heater = systems.filter(system => system.system_type === 'water heater');

const formatted = {
    hvac: hvac.map(system => ({ 
        id: system.id,
        system_type_detail: system.system_type_detail
    })),
    water_heater: water_heater.map(system => ({ 
        id: system.id,
        system_type_detail: system.system_type_detail
    }))
};

return formatted;