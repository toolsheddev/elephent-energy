SELECT
  eq.*,
  ahri_data.capacity_json
FROM
  equipment_new AS eq
LEFT JOIN LATERAL (
  SELECT
    ahri.capacity_json
  FROM
    ahri_certifications_new AS ahri
  WHERE
    eq.model_number LIKE ahri.fuzzy_parent_id_opt
  ORDER BY
    ahri.specificity_rank_opt DESC,
    LENGTH(ahri.capacity_json::text) DESC
  LIMIT 1
) AS ahri_data ON true
WHERE
  eq.equipment_type = 'Condenser'
  AND eq.active = true;