SELECT * FROM bayou_customers
WHERE customer_id = {{ project.data.customer_id }}
AND bills_available = false
ORDER BY bayou_customer_created_at desc
LIMIT 1