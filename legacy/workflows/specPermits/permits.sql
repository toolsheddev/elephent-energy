WITH state_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction = {{house.state}} AND jurisdiction_type = 'state'
),city_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction = {{house.city}} AND jurisdiction_type = 'city'
),
county_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction = {{house.county}} AND jurisdiction_type = 'county'
),
other_permits AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY permit_type ORDER BY id) AS rn
    FROM permits_new
    WHERE jurisdiction_type = 'other'
)
SELECT *
FROM state_permits
WHERE rn = 1
UNION ALL
SELECT *
FROM city_permits
WHERE rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM state_permits AS sp
    WHERE sp.permit_type = city_permits.permit_type AND sp.rn = 1
)
UNION ALL
SELECT *
FROM county_permits
WHERE rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM state_permits AS sp
    WHERE sp.permit_type = county_permits.permit_type AND sp.rn = 1
) AND NOT EXISTS (
    SELECT 1
    FROM city_permits AS cp
    WHERE cp.permit_type = county_permits.permit_type AND cp.rn = 1
)
UNION ALL
SELECT *
FROM other_permits
WHERE rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM state_permits AS sp
    WHERE sp.permit_type = other_permits.permit_type AND sp.rn = 1
) AND NOT EXISTS (
    SELECT 1
    FROM city_permits AS cp
    WHERE cp.permit_type = other_permits.permit_type AND cp.rn = 1
) AND NOT EXISTS (
    SELECT 1
    FROM county_permits AS co
    WHERE co.permit_type = other_permits.permit_type AND co.rn = 1
);
