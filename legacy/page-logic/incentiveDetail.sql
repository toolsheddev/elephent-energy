SELECT id, name, system_type, incentive_type as type_detail, recipient
  FROM incentives_new
WHERE id = {{lineItemName.value}}
