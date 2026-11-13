SELECT
  *
FROM
  equipment_new
WHERE
  equipment_type = {{option1}}
  OR equipment_type = {{option2}}
  OR equipment_type = {{option3}}
  OR equipment_type = {{option4}}
ORDER BY
  model_number