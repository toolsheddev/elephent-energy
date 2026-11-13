WITH base AS (
  SELECT
    s.id              AS system_id,
    s.system_type     AS system_type,
    li.id             AS line_item_id,
    li.line_item_type AS line_item_type,
    li.labor_id,
    li.permit_id,
    COALESCE(li.price_actual, 0)::numeric  AS price_actual,
    COALESCE(li.margin_amount, 0)::numeric AS margin_amount,

    -- ✅ ROUND EACH LINE ITEM HERE
    ROUND(
      COALESCE(li.price_actual, 0) + COALESCE(li.margin_amount, 0)
    )::numeric AS total_amount,

    l.category        AS labor_category,
    p.permit_type     AS permit_type
  FROM systems_new s
  JOIN line_items_new li
    ON li.system_id = s.id
  LEFT JOIN labor_new l
    ON l.id = li.labor_id
  LEFT JOIN permits_new p
    ON p.id = li.permit_id
  WHERE s.proposal_id = {{ startTrigger.data.proposalToGenerate[0] }}
    AND s.system_status IN (
      'proposed', 
      'active as change order', 
      'active - from change order'
    )
    AND (
      li.status IN (
        'active - from change order',
        'active - from finalized proposal',
        'pending deletion'
      )
      OR li.status IS NULL
    )
),

rollups AS (
  -- =========================
  -- HVAC
  -- =========================
  SELECT
    'HVAC Labor'::text AS description,
    SUM(b.total_amount)::numeric AS amount
  FROM base b
  WHERE
    (
      (b.system_type = 'hvac'
       AND b.line_item_type = 'labor'
       AND (b.labor_id IS NULL OR b.labor_category IN ('hvac', 'other')))
      OR
      (b.system_type = 'hvac'
       AND b.line_item_type = 'discount')
      OR
      (b.system_type = 'other'
       AND b.permit_type = 'hvac')
    )

  UNION ALL

  SELECT
    'HVAC Equipment'::text AS description,
    SUM(b.total_amount)::numeric AS amount
  FROM base b
  WHERE b.system_type = 'hvac'
    AND b.line_item_type = 'equipment'

  -- =========================
  -- Water Heater
  -- =========================
  UNION ALL

  SELECT
    'Water Heater Labor'::text AS description,
    SUM(b.total_amount)::numeric AS amount
  FROM base b
  WHERE
    (
      (b.system_type = 'water heater'
       AND b.line_item_type = 'labor'
       AND (b.labor_id IS NULL OR b.labor_category IN ('plumbing', 'other')))
      OR
      (b.system_type = 'water heater'
       AND b.line_item_type = 'discount')
      OR
      ((b.system_type IN ('water heater', 'other'))
       AND b.permit_type = 'plumbing')
    )

  UNION ALL

  SELECT
    'Water Heater Equipment'::text AS description,
    SUM(b.total_amount)::numeric AS amount
  FROM base b
  WHERE b.system_type = 'water heater'
    AND b.line_item_type = 'equipment'

  -- =========================
  -- Electrical wiring
  -- =========================
  UNION ALL

  SELECT
    'Electrical Wiring Labor'::text AS description,
    SUM(b.total_amount) * 0.60 AS amount
  FROM base b
  WHERE b.system_type NOT IN ('panel', 'ev')
    AND (
      (b.line_item_type = 'labor' AND b.labor_category = 'electrical')
      OR b.permit_type = 'electrical'
    )

  UNION ALL

  SELECT
    'Electrical Wiring Equipment'::text AS description,
    SUM(b.total_amount) * 0.40 AS amount
  FROM base b
  WHERE b.system_type NOT IN ('panel', 'ev')
    AND (
      (b.line_item_type = 'labor' AND b.labor_category = 'electrical')
      OR b.permit_type = 'electrical'
    )

  -- =========================
  -- Panel
  -- =========================
  UNION ALL

  SELECT
    'Panel Labor'::text AS description,
    SUM(b.total_amount) * 0.60 AS amount
  FROM base b
  WHERE b.system_type = 'panel'
    AND b.line_item_type IN ('labor', 'equipment', 'discount')

  UNION ALL

  SELECT
    'Panel Equipment'::text AS description,
    SUM(b.total_amount) * 0.40 AS amount
  FROM base b
  WHERE b.system_type = 'panel'
    AND b.line_item_type IN ('labor', 'equipment', 'discount')
)

SELECT
  description,
  COALESCE(amount, 0)::numeric AS amount
FROM rollups
ORDER BY
  CASE description
    WHEN 'HVAC Labor' THEN 1
    WHEN 'HVAC Equipment' THEN 2
    WHEN 'Water Heater Labor' THEN 3
    WHEN 'Water Heater Equipment' THEN 4
    WHEN 'Electrical Wiring Labor' THEN 5
    WHEN 'Electrical Wiring Equipment' THEN 6
    WHEN 'Panel Labor' THEN 7
    WHEN 'Panel Equipment' THEN 8
    ELSE 999
  END;
