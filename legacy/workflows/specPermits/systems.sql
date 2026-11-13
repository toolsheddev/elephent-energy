SELECT
  *
FROM
  systems_new
WHERE
  house_id = {{house_id}}
and system_status not in ('proposed - from change order', 'deleted - from change order', 'pending deletion')