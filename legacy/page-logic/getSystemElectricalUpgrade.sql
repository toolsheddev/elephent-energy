select lne.*,lbr.* from line_items_new lne join labor_new lbr on lne.labor_id = lbr.id
where system_id = {{active_system_row.value.id}}
and line_item_type = 'labor'
and lne.manually_added != true