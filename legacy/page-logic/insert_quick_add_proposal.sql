INSERT INTO proposals_new (house_id, project_id, nickname, proposal_created_at, proposal_status) 
VALUES (
    {{ house_id }}, 
    {{ project.data.id }},
    {{ proposal_name }}, 
    NOW(), 
   'pending'
) 
RETURNING id;