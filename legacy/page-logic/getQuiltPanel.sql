select lne.* from line_items_new lne
where system_id = {{ active_system_row.value.id }}
and equipment_id IN(905,906)