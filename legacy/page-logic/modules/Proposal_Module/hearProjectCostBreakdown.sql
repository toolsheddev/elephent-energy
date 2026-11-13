WITH base AS (
  SELECT
    s.id              AS system_id,
    s.system_type     AS system_type,
    s.ahri_id         AS ahri_id,

    li.id             AS line_item_id,
    li.line_item_type AS line_item_type,
    li.labor_id,
    li.permit_id,
    li.equipment_id,
    li.description    AS line_item_description,

    ROUND(
      COALESCE(li.price_actual, 0)
      + COALESCE(li.margin_amount, 0)
    )::numeric AS total_amount,

    l.category     AS labor_category,
    p.permit_type  AS permit_type,
    e.model_number AS equipment_model_number
  FROM systems_new s
  JOIN line_items_new li
    ON li.system_id = s.id
  LEFT JOIN labor_new l
    ON l.id = li.labor_id
  LEFT JOIN permits_new p
    ON p.id = li.permit_id
  LEFT JOIN equipment_new e
    ON e.id = li.equipment_id
  WHERE s.proposal_id = {{ proposalsToGenerate.value[0] }}
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

-- -------------------------------------------------
-- Equipment models per system
-- -------------------------------------------------
models_by_system AS (
  SELECT
    system_id,
    string_agg(DISTINCT equipment_model_number, ' | ')
      FILTER (WHERE equipment_model_number IS NOT NULL) AS models
  FROM base
  GROUP BY system_id
),

-- -------------------------------------------------
-- AHRI info per system
-- -------------------------------------------------
ahri_by_system AS (
  SELECT
    s.id AS system_id,
    a.ahri_number,
    a.seer_2,
    a.eer_2,
    a.hspf_2
  FROM systems_new s
  LEFT JOIN ahri_certifications_new a
    ON a.id = s.ahri_id
  WHERE s.proposal_id = {{ proposalsToGenerate.value[0] }}
),

-- -------------------------------------------------
-- Heat Pump / HPWH spec strings
-- -------------------------------------------------
hp_specs_per_system AS (
  SELECT
    b.system_id,
    b.system_type,
    trim(both ' |' FROM concat_ws(
      ' | ',
      CASE WHEN a.ahri_number IS NOT NULL THEN 'AHRI: '  || a.ahri_number END,
      CASE WHEN a.seer_2       IS NOT NULL THEN 'SEER2: ' || a.seer_2 END,
      CASE WHEN a.eer_2        IS NOT NULL THEN 'EER2: '  || a.eer_2 END,
      CASE WHEN a.hspf_2       IS NOT NULL THEN 'HSPF2: ' || a.hspf_2 END,
      CASE WHEN m.models       IS NOT NULL THEN 'Model #s: ' || m.models END
    )) AS spec_string
  FROM (
    SELECT DISTINCT system_id, system_type
    FROM base
    WHERE system_type IN ('hvac', 'water heater')
  ) b
  LEFT JOIN ahri_by_system a
    ON a.system_id = b.system_id
  LEFT JOIN models_by_system m
    ON m.system_id = b.system_id
),

hp_specs_by_measure AS (
  SELECT
    CASE
      WHEN system_type = 'hvac' THEN 'heat_pump'
      WHEN system_type = 'water heater' THEN 'hpwh'
    END AS measure_key,
    string_agg(spec_string, ' / ' ORDER BY system_id) AS details
  FROM hp_specs_per_system
  GROUP BY 1
),

-- -------------------------------------------------
-- Electrical wiring details
-- -------------------------------------------------
electrical_details AS (
  SELECT
    'electrical_wiring'::text AS measure_key,
    trim(both ' |' FROM concat_ws(
      ' | ',
      string_agg(
        DISTINCT line_item_description,
        ' | '
      ) FILTER (
        WHERE line_item_type = 'labor'
          AND labor_category = 'electrical'
          AND line_item_description IS NOT NULL
      ),
      string_agg(
        DISTINCT equipment_model_number,
        ' | '
      ) FILTER (
        WHERE line_item_type = 'equipment'
          AND equipment_model_number IS NOT NULL
          AND (
            labor_category = 'electrical'
            OR system_type = 'other'
          )
      )
    )) AS details
  FROM base
  WHERE system_type NOT IN ('panel', 'ev')
    AND (
      (line_item_type = 'labor' AND labor_category = 'electrical')
      OR (
        line_item_type = 'equipment'
        AND (labor_category = 'electrical' OR system_type = 'other')
      )
    )
),

-- -------------------------------------------------
-- Panel upgrade details
-- -------------------------------------------------
panel_details AS (
  SELECT
    'panel_upgrade'::text AS measure_key,
    trim(both ' |' FROM concat_ws(
      ' | ',
      string_agg(
        DISTINCT line_item_description,
        ' | '
      ) FILTER (
        WHERE line_item_type = 'labor'
          AND line_item_description IS NOT NULL
      ),
      string_agg(
        DISTINCT equipment_model_number,
        ' | '
      ) FILTER (
        WHERE equipment_model_number IS NOT NULL
      )
    )) AS details
  FROM base
  WHERE system_type = 'panel'
    AND line_item_type IN ('labor','equipment','discount')
),

measure_details AS (
  SELECT * FROM hp_specs_by_measure
  UNION ALL SELECT * FROM electrical_details
  UNION ALL SELECT * FROM panel_details
),

measure_labels AS (
  SELECT * FROM (VALUES
    ('heat_pump',        'Heat Pump'),
    ('hpwh',             'Heat Pump Water Heater'),
    ('electrical_wiring','Electrical Wiring'),
    ('panel_upgrade',    'Panel Upgrade')
  ) v(measure_key, label)
),

measure_desc AS (
  SELECT
    l.measure_key,
    l.label ||
      CASE
        WHEN d.details IS NOT NULL AND d.details <> ''
          THEN ' - ' || d.details
        ELSE ''
      END AS measure_description
  FROM measure_labels l
  LEFT JOIN measure_details d
    ON d.measure_key = l.measure_key
),

-- -------------------------------------------------
-- Count electrical-related measures present
-- -------------------------------------------------
electrical_measure_count AS (
  SELECT COUNT(*) AS measure_count
  FROM (
    SELECT 'electrical_wiring'
    FROM base
    WHERE system_type NOT IN ('panel','ev')
      AND line_item_type = 'labor'
      AND labor_category = 'electrical'

    UNION

    SELECT 'panel_upgrade'
    FROM base
    WHERE system_type = 'panel'
  ) m
),

-- -------------------------------------------------
-- Total electrical permit cost
-- -------------------------------------------------
electrical_permit_total AS (
  SELECT
    SUM(total_amount)::numeric AS permit_total
  FROM base
  WHERE permit_type = 'electrical'
),

electrical_permit_alloc AS (
  SELECT
    permit_total / NULLIF(measure_count, 0) AS per_measure_amount
  FROM electrical_permit_total
  CROSS JOIN electrical_measure_count
),

-- -------------------------------------------------
-- Cost rollups
-- -------------------------------------------------
rollups AS (

  -- Heat Pump
  SELECT 'heat_pump' AS measure_key, 'Labor' AS cost_type, SUM(total_amount) AS amount
  FROM base
  WHERE
    (
      (system_type = 'hvac' AND line_item_type = 'labor'
        AND (labor_id IS NULL OR labor_category IN ('hvac','other')))
      OR (system_type = 'hvac' AND line_item_type = 'discount')
      OR (system_type = 'other' AND permit_type = 'hvac')
    )

  UNION ALL
  SELECT 'heat_pump', 'Equipment', SUM(total_amount)
  FROM base
  WHERE system_type = 'hvac'
    AND line_item_type = 'equipment'

  -- HPWH
  UNION ALL
  SELECT 'hpwh', 'Labor', SUM(total_amount)
  FROM base
  WHERE
    (
      (system_type = 'water heater' AND line_item_type = 'labor'
        AND (labor_id IS NULL OR labor_category IN ('plumbing','other')))
      OR (system_type = 'water heater' AND line_item_type = 'discount')
      OR (system_type IN ('water heater','other') AND permit_type = 'plumbing')
    )

  UNION ALL
  SELECT 'hpwh', 'Equipment', SUM(total_amount)
  FROM base
  WHERE system_type = 'water heater'
    AND line_item_type = 'equipment'

  -- Electrical Wiring (60/40, EXCLUDING permits)
  UNION ALL
  SELECT 'electrical_wiring', 'Labor', SUM(total_amount) * 0.60
  FROM base
  WHERE system_type NOT IN ('panel','ev')
    AND line_item_type = 'labor'
    AND labor_category = 'electrical'

  UNION ALL
  SELECT 'electrical_wiring', 'Equipment', SUM(total_amount) * 0.40
  FROM base
  WHERE system_type NOT IN ('panel','ev')
    AND line_item_type = 'labor'
    AND labor_category = 'electrical'

  -- Panel Upgrade (60/40)
  UNION ALL
  SELECT 'panel_upgrade', 'Labor', SUM(total_amount) * 0.60
  FROM base
  WHERE system_type = 'panel'
    AND line_item_type IN ('labor','equipment','discount')

  UNION ALL
  SELECT 'panel_upgrade', 'Equipment', SUM(total_amount) * 0.40
  FROM base
  WHERE system_type = 'panel'
    AND line_item_type IN ('labor','equipment','discount')

  -- Electrical permit allocation (dynamic split)
  UNION ALL
  SELECT
    'electrical_wiring',
    'Labor',
    epa.per_measure_amount
  FROM electrical_permit_alloc epa
  WHERE EXISTS (
    SELECT 1
    FROM base
    WHERE system_type NOT IN ('panel','ev')
      AND line_item_type = 'labor'
      AND labor_category = 'electrical'
  )

  UNION ALL
  SELECT
    'panel_upgrade',
    'Labor',
    epa.per_measure_amount
  FROM electrical_permit_alloc epa
  WHERE EXISTS (
    SELECT 1
    FROM base
    WHERE system_type = 'panel'
  )
),

-- -------------------------------------------------
-- Final pivot
-- -------------------------------------------------
final AS (
  SELECT
    measure_key,
    SUM(CASE WHEN cost_type = 'Labor' THEN amount ELSE 0 END)::numeric AS labor_cost,
    SUM(CASE WHEN cost_type = 'Equipment' THEN amount ELSE 0 END)::numeric AS equipment_cost
  FROM rollups
  GROUP BY measure_key
)

SELECT
  md.measure_description AS measure_description,
  ROUND(f.labor_cost, 2)      AS labor_cost,
  ROUND(f.equipment_cost, 2)  AS equipment_cost,
  ROUND(f.labor_cost + f.equipment_cost, 2) AS total_cost
FROM final f
JOIN measure_desc md
  ON md.measure_key = f.measure_key
WHERE (f.labor_cost + f.equipment_cost) <> 0
ORDER BY
  CASE f.measure_key
    WHEN 'heat_pump' THEN 1
    WHEN 'hpwh' THEN 2
    WHEN 'electrical_wiring' THEN 3
    WHEN 'panel_upgrade' THEN 4
    ELSE 999
  END;
