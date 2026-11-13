(SELECT DISTINCT utility_name
FROM utilities_new
WHERE is_gas
  ORDER BY 1)

UNION ALL

(SELECT 'Not Listed' as utility_name)