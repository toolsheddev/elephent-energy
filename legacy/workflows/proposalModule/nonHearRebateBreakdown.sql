SELECT
  i.program                AS incentive_program,
  i.name                   AS incentive_name,
  s.system_type            AS system_type,

  -- keep raw enum (machine-safe)
  li.incentive_recipient   AS incentive_recipient_raw,

  -- display label (human-readable)
  CASE li.incentive_recipient
    WHEN 'homeowner' THEN 'Reimbursement - Direct to Customer'
    WHEN 'elephant'  THEN 'Instant discount'
    ELSE li.incentive_recipient::text
  END                      AS incentive_recipient_label,

  -- incentive amount (2 decimal places)
  ROUND(ABS(li.price_actual::numeric), 2) AS incentive_amount,

  -- optional traceability
  li.id                    AS line_item_id,
  li.incentive_id

FROM line_items_new li
JOIN systems_new s
  ON s.id = li.system_id
JOIN incentives_new i
  ON i.id = li.incentive_id

WHERE s.proposal_id = {{ startTrigger.data.proposalToGenerate[0] }}
  AND li.line_item_type = 'incentive'
  AND li.description NOT ILIKE '%HEAR%'

  -- exclude zero-value incentives
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
  s.system_type;
