SELECT
  *
FROM
  equipment_new
WHERE
  id = ANY({{equipment_ids}})