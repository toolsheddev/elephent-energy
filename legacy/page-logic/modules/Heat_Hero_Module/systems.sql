SELECT * FROM systems_new
WHERE house_id = {{house.data.id[0]}}
  AND system_status = 'active'
  AND system_type IN ('hvac', 'water heater')