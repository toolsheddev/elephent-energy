SELECT
  systems_new.proposal_id,
  systems_new.system_type_detail->>'fuel' AS fuel_type,
  MAX(
    CASE 
      WHEN equipment_new.equipment_type = 'Condenser' THEN equipment_new.manufacturer 
    END
  ) AS condenser_manufacturer,
  COUNT(
    CASE 
      WHEN equipment_new.equipment_type = 'Condenser' THEN 1 
    END
  ) AS condenser_count,
  COUNT(
    CASE 
      WHEN equipment_new.equipment_type = 'AHU' 
        OR equipment_new.equipment_type = 'furnace' THEN 1 
    END
  ) AS ahu_count,
  COUNT(
    CASE 
      WHEN equipment_new.equipment_type IN ('Wall Head', 'Floor Head', 'Ceiling Cassette') THEN 1 
    END
  ) AS minisplit_count
FROM line_items_new
JOIN systems_new 
  ON line_items_new.system_id = systems_new.id
JOIN equipment_new 
  ON line_items_new.equipment_id = equipment_new.id
WHERE
  systems_new.proposal_id = ANY({{ final_proposal_ids.data }}::int[])
  AND line_items_new.labor_id IS NULL
  AND (systems_new.system_status IN ('proposed', 'active - from change order') OR systems_new.system_status IS NULL)
  AND (line_items_new.status IN ('active - from finalized proposal', 'active - from change order') OR line_items_new.status IS NULL)
GROUP BY 
  systems_new.proposal_id,
  systems_new.system_type_detail->>'fuel'
HAVING
  COUNT(CASE WHEN equipment_new.equipment_type = 'Condenser' THEN 1 END) > 0;