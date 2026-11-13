SELECT
  *
FROM
  maintenance_plans_new
  INNER JOIN prices_new ON maintenance_plans_new.id = prices_new.maintenance_plan_id;