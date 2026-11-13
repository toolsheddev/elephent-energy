SELECT 
  id,
  equipment_name,
  model_number,
  model_series,
  manufacturer,
  refrigerant
FROM equipment_minimal
WHERE equipment_type = 'Branch Box'
ORDER BY model_number