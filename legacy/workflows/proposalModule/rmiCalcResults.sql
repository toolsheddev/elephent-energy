SELECT projects_new.rmi_calculator_results
FROM projects_new
JOIN proposals_new ON projects_new.id = proposals_new.project_id
WHERE proposals_new.id = {{ startTrigger.data.proposalToGenerate[0] }}