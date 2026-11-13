SELECT 
  equipment_id,
  market,
  alert_level
FROM 
  stock_alerts
WHERE 
  active = true;