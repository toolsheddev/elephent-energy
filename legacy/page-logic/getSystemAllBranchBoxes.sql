SELECT 
  lne.*, 
  eq.* FROM line_items_new lne 
JOIN equipment_new eq ON lne.equipment_id = eq.id
WHERE 
  lne.system_id = {{ active_system_row.value.id }}
  AND eq.equipment_type = 'Branch Box'
  AND eq.model_number != 'BBE-1'
  AND lne.line_item_type = 'equipment'
