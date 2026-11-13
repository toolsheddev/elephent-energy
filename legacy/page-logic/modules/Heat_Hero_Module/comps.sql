WITH comps AS (

SELECT hdd_new.*, 1.0 * hdd_design / houses_new.sq_footage as btu_per_sf
FROM hdd_new
INNER JOIN houses_new ON hdd_new.house_id = houses_new.id
WHERE houses_new.market_id = {{house.data.market_id[0]}}
AND houses_new.sq_footage >= {{house.data.sq_footage[0] * 0.75}}
AND houses_new.sq_footage <= {{house.data.sq_footage[0] * 1.25}}
AND houses_new.home_type = {{house.data.home_type[0]}}
)

SELECT avg(btu_per_sf), count(*)
FROM comps
