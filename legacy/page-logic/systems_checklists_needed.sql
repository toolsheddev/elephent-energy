SELECT systems_new.id AS system_id,
       systems_new.system_type,
       systems_new.system_type_detail,
       ahri_certifications_new.certification_type,
       ahri_certifications_new.certification_type_detail
FROM systems_new
LEFT JOIN ahri_certifications_new ON systems_new.ahri_id = ahri_certifications_new.id
WHERE systems_new.proposal_id = {{ finalized_proposal_id.value }}
AND systems_new.system_status IN(
  'proposed',
  'active - from change order',
  'active as change order',
  'pending deletion'
)