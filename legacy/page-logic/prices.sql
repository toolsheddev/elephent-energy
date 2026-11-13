SELECT
  *
FROM
  prices_new
WHERE
  (equipment_id = ANY({{equipment_ids}}) OR labor_id = ANY({{labor_ids}}))