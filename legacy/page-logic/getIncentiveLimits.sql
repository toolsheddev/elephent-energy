SELECT *
FROM incentive_limits_new
WHERE incentive_ids::jsonb != '[]'::jsonb;
