select projects_new.id as project_id,
  proposals_new.id as proposal_id,
  proposals_new.nickname,
  proposals_new.proposal_created_at,
  systems_new.system_type,
  ahri_certifications_new.ahri_number,
  ahri_certifications_new.is_cold_climate,
  ahri_certifications_new.is_mass_save_approved,
  ahri_certifications_new.heating_5,
  ahri_certifications_new.cooling_95,
  ahri_certifications_new.eer_2,
  ahri_certifications_new.hspf_2
from proposals_new
join projects_new on proposals_new.project_id = projects_new.id
join systems_new on proposals_new.id = systems_new.proposal_id
join ahri_certifications_new on systems_new.ahri_id = ahri_certifications_new.id
where projects_new.id = {{ value.id }};