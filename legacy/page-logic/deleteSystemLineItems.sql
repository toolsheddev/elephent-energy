UPDATE line_items_new 
SET 
    prior_status = status, 
    status = 'pending deletion' 
WHERE system_id = {{systemsTable.selectedRow.id}} and status not in ('deleted - from change order')
RETURNING id, prior_status, status;
