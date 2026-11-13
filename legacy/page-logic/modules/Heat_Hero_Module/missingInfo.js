const check = {{territory.data === undefined || house.data.sq_footage[0] === 0 || house.data.home_type[0] === null || house.data === undefined || existing_systems.value.hvac[0].system_type_detail.heating.fuel === null || existing_systems.value.hvac[0].system_type_detail.heating.fuel === undefined ||
existing_systems.value.hvac[0].system_type_detail.cooling.fuel === null || existing_systems.value.hvac[0].system_type_detail.cooling.fuel === undefined ||  
existing_systems.value.hvac === undefined || existing_systems.value.water_heater === undefined ||
existing_systems.value.water_heater[0].system_type_detail.fuel === null ||
existing_systems.value.water_heater[0].system_type_detail.fuel === undefined }} ;

return check