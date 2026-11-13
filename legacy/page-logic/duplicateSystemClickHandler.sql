WITH new_system AS (
    INSERT INTO systems_new (house_id, ahri_id, proposal_id, system_type_detail, system_type, system_status, system_created_at, target_margin, rebate_eligibility_type, system_nickname,sizing_graph)
    SELECT house_id, ahri_id, proposal_id, system_type_detail, system_type, system_status, NOW(), target_margin, rebate_eligibility_type, system_nickname || ' dup' as system_nickname, sizing_graph
    FROM systems_new
    WHERE id = {{systemsTable.selectedRow.id}}
    RETURNING id AS new_system_id
)
INSERT INTO line_items_new (equipment_id, labor_id, system_id, price_actual, serial_number, rebate_submitted_at, line_item_type, rebate_status, additional_data, zone_index, incentive_id,incentive_recipient, quantity, description, permit_id, discount_id, maintenance_plan_id, margin_amount, show_in_proposal, line_item_created_at, adjustment_reason, adjustment_explanation, equipment_provider, change_order_status)
SELECT li.equipment_id, li.labor_id, ns.new_system_id, li.price_actual, li.serial_number, li.rebate_submitted_at, li.line_item_type, li.rebate_status, li.additional_data, li.zone_index, li.incentive_id,li.incentive_recipient, li.quantity, li.description, li.permit_id, li.discount_id, li.maintenance_plan_id, li.margin_amount, li.show_in_proposal, NOW(), li.adjustment_reason, li.adjustment_explanation, li.equipment_provider, li.change_order_status
FROM line_items_new li
JOIN new_system ns ON TRUE
WHERE li.system_id = {{systemsTable.selectedRow.id}};
