SELECT line_items_new.*,
       labor_new.category
FROM line_items_new 
LEFT JOIN labor_new ON line_items_new.labor_id = labor_new.id
WHERE line_items_new.system_id = ANY ( {{ systems_finalized.data.map(i => i.id) }}) 
  AND (line_items_new.status IN ('active - from change order', 'active - from finalized proposal') 
  OR status IS NULL)