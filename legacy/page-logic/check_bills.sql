SELECT hdd_bills.* 
FROM hdd_bills
LEFT JOIN bayou_customers ON hdd_bills.bayou_customer_id = bayou_customers.bayou_id

WHERE bayou_customers.customer_id = {{ customer.data[0].id }}
  OR hdd_bills.customer_id = {{ customer.data[0].id }}