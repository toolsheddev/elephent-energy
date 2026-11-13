(SELECT DISTINCT utility_name
FROM utilities_new
WHERE is_electrical
  ORDER BY 1)

UNION ALL

(SELECT 'Not Listed' as utility_name)