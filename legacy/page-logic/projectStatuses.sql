SELECT
  enum.enumsortorder,
  type.typname,
  enum.enumlabel AS value
FROM pg_enum AS enum
JOIN pg_type AS type
  ON (type.oid = enum.enumtypid)
WHERE type.typname like 'project_status%'
GROUP BY enum.enumsortorder,
         enum.enumlabel,
         type.typname
ORDER BY enumsortorder