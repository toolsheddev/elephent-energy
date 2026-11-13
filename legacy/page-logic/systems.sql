SELECT
  systems_new.*, certification_type_detail, is_energystar, cooling_95, heating_47
FROM
  systems_new
LEFT JOIN 
  ahri_certifications_new ON systems_new.ahri_id = ahri_certifications_new.id
WHERE
  house_id = {{house_id}}
and system_status not in ('proposed - from change order', 'deleted - from change order', 'pending deletion')