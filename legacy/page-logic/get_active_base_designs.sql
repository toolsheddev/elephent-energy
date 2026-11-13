SELECT 
    ac.id,
    ac.pricing_structure,
    ac.nickname,
    ac.system_type,
    ac.ahri_number,
    ac.odu,
    ac.idu,
    ac.thermostat,
    eq.integrated_tmv
FROM ahri_configurations AS ac
LEFT JOIN equipment_new AS eq 
    ON ac.idu = eq.id
WHERE ac.active = true;