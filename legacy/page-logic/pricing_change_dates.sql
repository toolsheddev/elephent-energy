SELECT DISTINCT
  DATE
FROM
  (
    SELECT
      active_date AS DATE
    FROM
      prices_new
   -- UNION
   -- SELECT
   --   inactive_date AS DATE
   -- FROM
   --   prices_new
  ) AS combined_dates
WHERE
  DATE IS NOT NULL
ORDER BY
  DATE DESC;