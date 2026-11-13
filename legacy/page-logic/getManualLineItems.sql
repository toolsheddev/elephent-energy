select * from line_items_new where system_id = {{ systemsTable.selectedRow.id }}
and manually_added = true