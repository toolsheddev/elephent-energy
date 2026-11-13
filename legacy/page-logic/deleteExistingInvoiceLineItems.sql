delete from invoice_line_items_new
WHERE invoice_id IN (select id from invoices_new where project_id = {{ project.data.id }})
