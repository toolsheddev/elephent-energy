SELECT * FROM weather_stations
WHERE market = {{ house.data.market_id[0] }} 
  OR {{ !house.data.market_id[0] }}