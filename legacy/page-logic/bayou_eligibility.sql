WITH systems AS (
  SELECT 
    house_id,
    json_extract_path_text(system_type_detail,'heating','fuel') as existing_fuel_type,
    json_extract_path_text(system_type_detail,'cooling','fuel') as existing_cooling_fuel_type
  
  FROM systems_new 
  WHERE system_type = 'hvac' 
  AND proposal_id IS NULL
  ORDER BY system_created_at DESC
  LIMIT 1
),
  
raw AS (
  
  SELECT 
    houses_new.id as house_id,
    houses_new.state,
    houses_new.move_in_date,
    systems.existing_fuel_type,
    systems.existing_cooling_fuel_type,
    case when state = 'CA' and systems.existing_cooling_fuel_type = 'electricity' then 'cooling'
     when state = 'CA' and systems.existing_cooling_fuel_type = 'electric' then 'cooling'
      else 'heating' end as sizing_method,
  
    DATE_PART('day', now() - houses_new.move_in_date) as days_in_home,
    houses_new.has_paperless_billing,
    electric.bayou_utility_name as bayou_electric_utility_name,
    gas.bayou_utility_name as bayou_gas_utility_name
  
  FROM houses_new
  LEFT JOIN systems 
    ON houses_new.id = systems.house_id
  LEFT JOIN utilities_new AS electric 
    ON houses_new.electric_utility = electric.utility_name
  LEFT JOIN utilities_new AS gas 
    ON houses_new.gas_utility = gas.utility_name
  WHERE houses_new.id = {{house_id}}

  )

SELECT
  house_id,
  state,
  existing_fuel_type,
  existing_cooling_fuel_type,
  sizing_method,
  move_in_date,
  days_in_home,
  has_paperless_billing,
  bayou_electric_utility_name,
  bayou_gas_utility_name,
  
  CASE 
      WHEN DATE_PART('day', now() - move_in_date) >= 270 AND has_paperless_billing AND 
        sizing_method = 'heating' AND bayou_gas_utility_name IS NOT NULL  THEN true 
      WHEN DATE_PART('day', now() - move_in_date) >= 270 AND has_paperless_billing AND 
        sizing_method = 'cooling' AND bayou_electric_utility_name IS NOT NULL  THEN true 
      ELSE false 
  END AS is_eligible_for_bayou,

  CASE 
      WHEN NOT has_paperless_billing 
        THEN 'Does not have paperless billing'
      WHEN sizing_method = 'heating' AND existing_fuel_type != 'gas'
        THEN 'Existing heating is not gas'
      WHEN bayou_gas_utility_name IS NULL AND sizing_method = 'heating'
        THEN 'Utility not supported'
      WHEN bayou_electric_utility_name IS NULL AND sizing_method = 'cooling'
        THEN 'Utility not supported'
      WHEN days_in_home < 270 
        THEN 'Not in home long enough (9+ months)'
      WHEN days_in_home is null
        THEN 'Provide a move in month and year to ensure customer has been in home long enough (9+ months)'
      ELSE NULL 
  END AS bayou_rejection_reason,

  CASE 
    WHEN NOT has_paperless_billing 
        THEN 'Request PDF bills'
      WHEN sizing_method = 'heating' AND existing_fuel_type != 'gas'
        THEN 'I''ll do a Manual J'
      WHEN bayou_gas_utility_name IS NULL AND sizing_method = 'heating'
        THEN 'Request PDF bills'
      WHEN bayou_electric_utility_name IS NULL AND sizing_method = 'cooling'
        THEN 'Request PDF bills'
      WHEN days_in_home < 270 
        THEN 'I''ll do a Manual J'
      WHEN days_in_home is null
        THEN 'Send Bayou anyways'
      ELSE NULL 
  END AS alternative_option

FROM raw
  