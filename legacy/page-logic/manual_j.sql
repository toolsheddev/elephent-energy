SELECT
      zipcode_mapping.city,
      zipcode_mapping.manual_j_required
FROM
    zipcode_mapping
WHERE
    zipcode_mapping.city = {{ house.data.city }}