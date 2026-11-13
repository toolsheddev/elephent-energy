SELECT 
  * FROM incentives_new 
WHERE 
  -- Active Date check: Agar date null hai to hamesha active, warna range check karein
  (active_date IS NULL OR active_date <= {{ active_system_row.value.rebate_effective_date }}::date)
  AND 
  -- Inactive Date check: Agar date null hai to hamesha active, warna range check karein
  (inactive_date IS NULL OR inactive_date >= {{ active_system_row.value.rebate_effective_date }}::date)
ORDER BY name ASC;