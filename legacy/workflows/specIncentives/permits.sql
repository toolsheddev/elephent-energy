SELECT line_items_new.price_actual,
       permits_new.permit_type
FROM line_items_new
JOIN systems_new ON line_items_new.system_id = systems_new.id
JOIN permits_new ON line_items_new.permit_id = permits_new.id
WHERE systems_new.proposal_id = {{ startTrigger.data.proposal_id }}
AND systems_new.system_type = 'other'