SELECT
  systems_new.proposal_id,
  COUNT(*) as count
FROM
  line_items_new
  JOIN systems_new ON line_items_new.system_id = systems_new.id
WHERE
  systems_new.proposal_id = ANY({{ final_proposal_ids.data }})
  AND line_items_new.labor_id = 122
  AND (
    {{ startTrigger.data.mode }} IN ('add system', 'add_system')
    OR 
    systems_new.id != {{ startTrigger.data.system_id }}
  )
GROUP BY systems_new.proposal_id