delete from invoice_line_items_new
WHERE id = ANY({{ del.map(item => item.id) }});
