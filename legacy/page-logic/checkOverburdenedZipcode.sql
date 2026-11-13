SELECT COUNT(*) as count
FROM overburdened_zipcodes
WHERE zipcode = {{ Zipcode.value }}