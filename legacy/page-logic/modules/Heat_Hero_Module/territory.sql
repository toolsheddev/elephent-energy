SELECT *,
  CASE 
    WHEN install_territory = 'Colorado - North' THEN 'BDU'
    WHEN install_territory = 'Colorado - South' THEN 'DEN'
    WHEN territory = 'Massachusetts' THEN 'BOS'
  END as default_station
  
FROM zipcode_mapping
WHERE zipcode = {{house.data.zipcode[0] != '' ? house.data.zipcode[0] : null}}