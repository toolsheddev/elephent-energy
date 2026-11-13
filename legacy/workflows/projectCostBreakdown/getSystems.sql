SELECT
  systems_new.*
FROM
  systems_new
WHERE
  proposal_id::varchar = ANY ( {{proposal_id}} )
and system_status in ('active - from change order', 'proposed', 'active')