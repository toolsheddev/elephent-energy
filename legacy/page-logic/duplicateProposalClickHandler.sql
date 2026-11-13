WITH proposal AS (
    SELECT
        nextval('proposals_new_id_seq') AS id,
        house_id,
        project_id,
        proposal_link,
        proposal_status,
        nickname || ' dup' AS nickname,
        NOW() AS proposal_created_at,
        id AS og_proposal_id
    FROM proposals_new
    WHERE id = {{proposalTable.selectedRow.id}}
),
proposal_systems AS (
    SELECT
        nextval('systems_new_id_seq') AS id,
        s.house_id,
        s.ahri_id,
        p.id AS proposal_id,
        s.system_type_detail,
        s.system_type,
        s.system_status,
        s.system_created_at,
        s.target_margin,
        s.rebate_eligibility_type,
        s.system_nickname || ' dup' AS system_nickname,
        s.id AS og_system_id,
        s.sizing_graph
    FROM systems_new s
    JOIN proposal p ON p.og_proposal_id = s.proposal_id
),
system_line_items AS (
    SELECT
        nextval('line_items_new_id_seq') AS id,
        l.equipment_id,
        l.labor_id,
        ps.id AS system_id,
        l.price_actual,
        l.serial_number,
        l.rebate_submitted_at,
        l.line_item_type,
        l.rebate_status,
        l.additional_data,
        l.zone_index,
        l.incentive_id,
        l.incentive_recipient,
        l.quantity,
        l.description,
        l.permit_id,
        l.discount_id,
        l.maintenance_plan_id,
        l.margin_amount,
        l.show_in_proposal,
        l.line_item_created_at,
        l.adjustment_reason,
        l.adjustment_explanation,
        l.equipment_provider,
        l.change_order_status,
        l.margin_percent,
        l.location
    FROM line_items_new l
    JOIN proposal_systems ps ON l.system_id = ps.og_system_id
),
insert_proposals AS (
    INSERT INTO proposals_new (
        id,
        house_id,
        project_id,
        proposal_link,
        proposal_status,
        nickname,
        proposal_created_at
    )
    SELECT
        id,
        house_id,
        project_id,
        proposal_link,
        proposal_status,
        nickname,
        proposal_created_at
    FROM proposal
    RETURNING id
),
insert_systems AS (
    INSERT INTO systems_new (
        id,
        house_id,
        ahri_id,
        proposal_id,
        system_type_detail,
        system_type,
        system_status,
        system_created_at,
        target_margin,
        rebate_eligibility_type,
        system_nickname,
        sizing_graph
    )
    SELECT
        id,
        house_id,
        ahri_id,
        proposal_id,
        system_type_detail,
        system_type,
        system_status,
        system_created_at,
        target_margin,
        rebate_eligibility_type,
        system_nickname,
        sizing_graph
    FROM proposal_systems
    RETURNING id
),
insert_line_items AS (
    INSERT INTO line_items_new (
        id,
        equipment_id,
        labor_id,
        system_id,
        price_actual,
        serial_number,
        rebate_submitted_at,
        line_item_type,
        rebate_status,
        additional_data,
        zone_index,
        incentive_id,
        incentive_recipient,
        quantity,
        description,
        permit_id,
        discount_id,
        maintenance_plan_id,
        margin_amount,
        show_in_proposal,
        line_item_created_at,
        adjustment_reason,
        adjustment_explanation,
        equipment_provider,
        change_order_status,
        margin_percent,
        location
    )
    SELECT
        id,
        equipment_id,
        labor_id,
        system_id,
        price_actual,
        serial_number,
        rebate_submitted_at,
        line_item_type,
        rebate_status,
        additional_data,
        zone_index,
        incentive_id,
        incentive_recipient,
        quantity,
        description,
        permit_id,
        discount_id,
        maintenance_plan_id,
        margin_amount,
        show_in_proposal,
        line_item_created_at,
        adjustment_reason,
        adjustment_explanation,
        equipment_provider,
        change_order_status,
        margin_percent,
        location
    FROM system_line_items
    RETURNING id
)


SELECT 
    (SELECT id FROM insert_proposals) AS proposal_id,
    (SELECT id FROM insert_systems LIMIT 1) AS system_id,
    (SELECT id FROM insert_line_items LIMIT 1) AS line_item_id;
