WITH new_proposal AS (
    INSERT INTO proposals_new (
        project_id, 
        house_id, 
        proposal_status, 
        nickname, 
        proposal_created_at
    )
    VALUES (
        {{ startTrigger.data.specIncentives.project.id }}, 
        {{ startTrigger.data.specIncentives.house.id }}, 
        'pending',
        {{ value }}, 
        NOW()
    )
    RETURNING id
),
new_system AS (
    INSERT INTO systems_new (
        system_type, 
        house_id, 
        system_status, 
        proposal_id, 
        system_created_at
    )
    SELECT 
        'other',
        {{ startTrigger.data.specIncentives.house.id }},
        'proposed',
        id, 
        NOW()
    FROM new_proposal
    -- We run the insert, but we don't need to return anything from this step
)
-- END WITH A PURE SELECT SO RETOOL GRABS THE DATA!
SELECT id FROM new_proposal;