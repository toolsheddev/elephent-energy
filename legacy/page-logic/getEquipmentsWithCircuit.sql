select * from equipment_new
where electrical_requirements is not null
and electrical_requirements != '{}';