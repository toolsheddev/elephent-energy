SELECT
    hdd_design AS heat_load, 
    (assumptions ->> 'designTemp')::float AS design_temp
FROM
    hdd_new
WHERE
    house_id = {{house?.data?.id}}