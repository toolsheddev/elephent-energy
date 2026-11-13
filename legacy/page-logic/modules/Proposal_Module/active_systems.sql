SELECT * FROM systems_new
WHERE systems_new.house_id = {{ house.value.id }}
AND system_status = 'active'
AND (system_type = 'hvac' or system_type = 'water heater')
ORDER BY system_type