select lne.*,eq.* from line_items_new lne join equipment_new eq on lne.equipment_id = eq.id
where system_id = {{active_system_row.value.id}}
and (equipment_type ='AHU'
  OR equipment_type = 'Dual-Fuel Coil'
OR equipment_type = 'furnace')
and line_item_type = 'equipment'
and lne.manually_added != true