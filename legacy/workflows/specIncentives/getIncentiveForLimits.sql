select li.price_actual,
        li.incentive_id
from line_items_new li
join systems_new s on li.system_id = s.id
where 
  li.incentive_id is not null
  and li.price_actual != 0
  AND (li.status not in ('proposed - from change order', 'deleted - from change order', 'pending deletion')
  or status is null)
  and s.house_id = {{startTrigger.data.house.id}}
  and (
    s.system_status = 'active'
    or (
      s.proposal_id = {{startTrigger.data.proposal_id}}
      AND {{ startTrigger.data.mode }} IN ('add system', 'add_system')
    )
    or (
      s.proposal_id = {{ startTrigger.data.proposal_id}}
      and s.id != {{ startTrigger.data.existing_system_id}}
      and (
        {{ startTrigger.data.mode }} IN ('edit_system', 'edit system')
        or {{ !(startTrigger.data.mode) }}
      )
    )
  );
