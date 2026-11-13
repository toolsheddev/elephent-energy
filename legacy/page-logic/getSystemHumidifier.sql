select lne.*,eq.* from line_items_new lne join equipment_new eq on lne.equipment_id = eq.id
where
    system_id = {{ active_system_row.value.id }}
  and
    line_item_type = 'equipment'
and
    equipment_type = 'Humidifier';