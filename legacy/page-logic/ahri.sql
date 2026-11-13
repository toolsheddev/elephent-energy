WITH data AS (
  SELECT
    *,
    CASE WHEN position('*' IN parent_equipment_id) = 0 THEN parent_equipment_id
         ELSE REPLACE(parent_equipment_id, '*', '%') END AS fuzzy_parent_id,
    CASE WHEN position('*' IN child_equipment_id) = 0 THEN child_equipment_id
         ELSE REPLACE(child_equipment_id, '*', '%') END AS fuzzy_child_id,
    length(REPLACE(parent_equipment_id, '*', '')) AS specificity_rank -- Measure of specificity; longer is more specific
  FROM
    ahri_certifications_new
)
SELECT *
FROM data
WHERE 
  REPLACE({{condenser_id}}, '.TH', '') LIKE fuzzy_parent_id
  AND ({{indoor_unit_id}} LIKE fuzzy_child_id OR child_equipment_id = '' OR child_equipment_id is null)
  AND 
    {{system_type_detail}} = certification_type_detail::text
ORDER BY specificity_rank DESC -- Ensures the most specific match comes first
LIMIT 1;  -- Ensures only the most specific match is returned
