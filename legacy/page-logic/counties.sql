(SELECT DISTINCT county
FROM zipcode_mapping
WHERE state = {{State.value}}
OR {{State.value}}::varchar IS NULL
  ORDER BY 1)

UNION ALL

(SELECT 'Not Listed' as county)