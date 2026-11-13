SELECT 
  projects.*,
  customers.first_name,
  customers.last_name,
  customers.pipedrive_customer_id
FROM projects_new AS projects
LEFT JOIN customers_new AS customers 
  ON projects.customer_id = customers.id
