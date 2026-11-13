SELECT name,
       slack_id
FROM employees
WHERE name LIKE {{ hca.data.hca[0] }}