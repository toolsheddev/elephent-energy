INSERT INTO systems_new (
    house_id, 
    ahri_id, 
    proposal_id, 
    system_type, 
    system_status, 
    system_created_at, 
    system_nickname,
    target_margin,
    rebate_effective_date
)
VALUES (
    {{ house.data.id }}, 
    (SELECT id FROM ahri_certifications_new WHERE ahri_number = {{ current_ahri_number }}::text LIMIT 1),
    {{ current_proposal_id }}, -- We will pass this from the script!
    {{ current_system_type }},
    {{ current_status }},
    NOW(),
    {{ current_nickname }},
    {{ current_margin }} ,
  {{ current_rebate_date }}
)
RETURNING id AS system_id, proposal_id;