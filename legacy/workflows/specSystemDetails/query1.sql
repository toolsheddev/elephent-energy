SELECT 
  line_items_new.id,
  equipment_new.equipment_type,
  line_items_new.labor_id,
  line_items_new.status AS line_item_status,
  systems_new.system_status
FROM line_items_new
JOIN systems_new ON line_items_new.system_id = systems_new.id
JOIN equipment_new ON line_items_new.equipment_id = equipment_new.id
WHERE systems_new.proposal_id = ANY({{ final_proposal_ids.data }}::int[]);