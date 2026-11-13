SELECT
  systems_new.*
FROM
  systems_new
WHERE
  proposal_id::varchar = ANY ( {{proposal_id}} )