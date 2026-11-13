select line_items_new.* from line_items_new 
  where system_id = ANY({{systems.data.map(item=> item.id)}}) 
and (status not in ('proposed - from change order', 'deleted - from change order', 'pending deletion')
  or status is null)