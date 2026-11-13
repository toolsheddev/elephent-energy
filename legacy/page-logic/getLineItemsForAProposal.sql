SELECT
  s.*,
  COALESCE(li.line_items, '[]'::json) AS line_items
FROM
  systems_new s
LEFT JOIN (
  SELECT
    system_id,
    JSON_AGG(
      line_items_new.*
      ORDER BY id
    ) AS line_items
  FROM
    line_items_new
  GROUP BY
    system_id
) li ON s.id = li.system_id
WHERE
  s.proposal_id = {{ active_proposal_row.value.id }}
and s.system_status in ('proposed', 'active - from change order')
