SELECT
  i.program AS incentive_program,
  i.name    AS incentive_name,

  -- 🔑 Override system_type if multiplier_type = 'electrical'
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_each(i.incentive_criteria::jsonb) AS crit(key, value)
      WHERE value->'amount'->>'multiplier_type' = 'electrical'
    )
    THEN 'Electrical Wiring'
    ELSE s.system_type::text
  END AS system_type,

  li.incentive_recipient AS incentive_recipient_raw,

  CASE li.incentive_recipient
    WHEN 'homeowner' THEN 'Reimbursement - Direct to Customer'
    WHEN 'elephant'  THEN 'Instant discount'
    ELSE li.incentive_recipient::text
  END AS incentive_recipient_label,

  ROUND(ABS(li.price_actual::numeric), 2) AS incentive_amount,

  li.id           AS line_item_id,
  li.incentive_id

FROM line_items_new li
JOIN systems_new s
  ON s.id = li.system_id
JOIN incentives_new i
  ON i.id = li.incentive_id

WHERE s.proposal_id = {{ proposalsToGenerate.value[0] }}
  AND li.line_item_type = 'incentive'
  AND li.description NOT ILIKE '%HEAR%'
  AND li.price_actual IS NOT NULL
  AND li.price_actual <> 0
  AND (
    li.status IN (
      'active - from change order',
      'active - from finalized proposal',
      'pending deletion'
    )
    OR li.status IS NULL
  )

ORDER BY
  i.program,
  i.name,
  system_type;
