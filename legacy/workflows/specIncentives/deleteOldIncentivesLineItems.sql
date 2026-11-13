delete from line_items_new
where system_id = {{ inc_system_id }} and line_item_type = 'incentive';