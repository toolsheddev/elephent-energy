SELECT
  *
FROM
  labor_new
WHERE
  id = ANY({{labor_id}})