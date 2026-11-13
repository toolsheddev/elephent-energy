SELECT id, 'equipment' as type, equipment_type as type_detail,  concat(model_number,' ', equipment_name::varchar ) as name, inflow_id, provider
  FROM equipment_new
