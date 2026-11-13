WITH city_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction = {{house.data.city}} AND jurisdiction_type = 'city'
),
county_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction = {{house.data.county}} AND jurisdiction_type = 'county'
),
other_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction_type = 'other'
)
SELECT *
FROM city_permits
WHERE rn = 1
UNION ALL
SELECT *
FROM county_permits
WHERE rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM city_permits AS cp
    WHERE cp.permit_type = county_permits.permit_type AND cp.rn = 1
)
UNION ALL
SELECT *
FROM other_permits
WHERE rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM city_permits AS cp
    WHERE cp.permit_type = other_permits.permit_type AND cp.rn = 1
)
AND NOT EXISTS (
    SELECT 1
    FROM county_permits AS co
    WHERE co.permit_type = other_permits.permit_type AND co.rn = 1
);
