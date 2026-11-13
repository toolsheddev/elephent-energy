SELECT 
  li.*, 
  e.manufacturer, 
  e.model_number, 
  e.equipment_type as category,
  e.is_energystar
FROM line_items_new li
LEFT JOIN equipment_new e ON li.equipment_id = e.id
WHERE li.system_id = {{ active_system_row.value.id }}