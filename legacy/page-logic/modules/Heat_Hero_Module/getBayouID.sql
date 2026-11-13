SELECT bayou_id
  FROM bayou_customers
WHERE bayou_customers.bayou_id = ANY ( {{customer.data.id}} )