SELECT
*
FROM
  ahri_certifications_new
WHERE
  REPLACE(COALESCE({{ condesorModel }}::TEXT, ''), '.TH', '') LIKE fuzzy_parent_id_opt
  AND (
    (
      {{ furnaceModel }}::TEXT IS NOT NULL
      AND {{ coilModel }}::TEXT LIKE fuzzy_child_id_opt
      AND {{ furnaceModel }}::TEXT LIKE fuzzy_furnace_id_opt 
    )
    OR
    (
      {{ furnaceModel }}::TEXT IS NULL
      AND (
        {{ indoorModel }}::TEXT LIKE fuzzy_child_id_opt
        OR child_equipment_id = ''
        OR child_equipment_id IS NULL
      )
     AND (furnace_id IS NULL OR furnace_id = '' or furnace_id = '%')
    )
  )
  AND {{ systemDuctingType }}::TEXT = certification_type_detail::TEXT

  OR (
    certification_type = 'water heater'
    AND parent_equipment_id LIKE {{ '%' + waterHeaterModel + '%' }}
  )
ORDER BY
  specificity_rank_opt DESC
LIMIT 1;