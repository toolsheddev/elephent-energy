SELECT projects_new.hca
FROM projects_new
WHERE projects_new.id = {{ project_id.value }}
