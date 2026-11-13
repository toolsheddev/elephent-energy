select * from line_items_new where system_id = ANY({{system_ids}}) 
and (status not in ('proposed - from change order', 'deleted - from change order')
  or status is null)