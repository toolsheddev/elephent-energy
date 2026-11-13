SELECT
  'Colorado HEAR'::text        AS program,

  li.description               AS description,

  CASE customers_new.annual_gross_income
    WHEN '50'  THEN 'Moderate-income'
    WHEN '100' THEN 'Low-income'
    ELSE NULL
  END                          AS household_income_category,

  -- raw enum (safe)
  li.incentive_recipient       AS incentive_recipient_raw,

  -- display label
  CASE li.incentive_recipient
    WHEN 'homeowner' THEN 'Reimbursement - Direct to Customer'
    WHEN 'elephant'  THEN 'Instant discount'
    ELSE li.incentive_recipient::text
  END                          AS type,

  ROUND(ABS(li.price_actual::numeric), 0)     AS amount,

  -- optional traceability
  li.id                        AS line_item_id,
  s.system_type                AS system_type
FROM line_items_new li
JOIN systems_new s
  ON s.id = li.system_id
JOIN proposals_new ON s.proposal_id = proposals_new.id
JOIN projects_new ON proposals_new.project_id = projects_new.id
JOIN customers_new ON projects_new.customer_id = customers_new.id
WHERE s.proposal_id = {{ startTrigger.data.proposalToGenerate[0] }}
  AND li.line_item_type = 'incentive'
  AND li.description ILIKE '%HEAR%'
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
  household_income_category,
  li.description;
