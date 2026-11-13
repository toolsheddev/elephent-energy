SELECT
  state
FROM
  zipcode_mapping
WHERE
  zipcode = {{ house.value.zipcode }}