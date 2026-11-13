with raw as (
  select 
  u.id as yer_user_id,
  h.id as yer_house_id,
  u.email as yer_email,
  h.address as yer_address,
  h.zip as yer_zip,
  h."squareFootage" as yer_square_footage,
  h."builtIn" as yer_year_built,
  jsonb_array_elements(jsonb_extract_path_text(q.quiz_list, 'question_list')::jsonb) as quiz
  
  from users u 
  inner join houses h on u.id = h."userId"
  inner join quiz q on h.id = q."houseId"
  where u.email = {{email}}
    and (h.zip = {{zipcode}}::varchar or {{zipcode}}::varchar = '')
),
  cleanup as (
  select
  yer_user_id,
  yer_email,
  yer_address,
  yer_zip,
  yer_square_footage,
  yer_year_built,
  yer_house_id,
  jsonb_extract_path_text(quiz,'id') as question_id,
  jsonb_extract_path_text(quiz,'title') as question_name,
  jsonb_array_elements(jsonb_extract_path_text(quiz,'user_answer')::jsonb) as answer
  from raw
),
  cleanup_answers as (
  select 
  yer_user_id,
  yer_email,
  yer_address,
  yer_zip,
  yer_square_footage,
  yer_year_built,
  yer_house_id,
  question_id::int,
  case when question_id::int = 1 then 'comfort'
    when question_id::int = 2 then 'project'
    when question_id::int = 3 then 'timeline'
    when question_id::int = 4 then 'electrical_service'
    when question_id::int = 5 then 'ducted'
    when question_id::int = 6 then 'heating_fuel'
    when question_id::int = 7 then 'heating_condition'
    when question_id::int = 8 then 'heating_age'
    when question_id::int = 9 then 'wh_fuel'
    when question_id::int = 10 then 'wh_condition'
    when question_id::int = 11 then 'wh_age'
    when question_id::int = 12 then 'other_appliances'
    when question_id::int = 13 then 'existing_upgrades'
    when question_id::int = 14 then 'addtl_notes'
  else null end as question_shortened,
  question_name,
  jsonb_extract_path_text(answer,'name') as answer
  from cleanup
),

  flattened as (
  select 
  yer_user_id,
  yer_email,
  yer_address,
  yer_zip,
  yer_square_footage,
  yer_year_built,
  yer_house_id,
  question_id,
  question_shortened,
  question_name,
  json_agg(answer) as answers
  from cleanup_answers
  group by 1,2,3,4,5,6,7,8,9,10),

final as (
  select 
  yer_user_id,
  yer_email,
  yer_address,
  yer_zip,
  yer_square_footage,
  yer_year_built,
  yer_house_id,
  replace(replace(replace(max(case when question_shortened = 'comfort' then answers::varchar end),'[',''),']',''),'"','')::varchar as comfort_issues,
  replace(replace(replace(max(case when question_shortened = 'project' then answers::varchar end),'[',''),']',''),'"','')::varchar as project_type,
  replace(replace(replace(max(case when question_shortened = 'timeline' then answers::varchar end),'[',''),']',''),'"','')::varchar as timeline,
  replace(replace(replace(max(case when question_shortened = 'electrical_service' then answers::varchar end),'[',''),']',''),'"','')::varchar as electrical_service,
  replace(replace(replace(max(case when question_shortened = 'ducted' then answers::varchar end),'[',''),']',''),'"','')::varchar as ducted,

  
  lower(case when 
    replace(replace(replace(max(case when question_shortened = 'heating_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Natural gas' then 'Gas' 
  when replace(replace(replace(max(case when question_shortened = 'heating_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Electric resistance' then 'Electric'
  when replace(replace(replace(max(case when question_shortened = 'heating_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Fuel oil' then 'Oil'
  else replace(replace(replace(max(case when question_shortened = 'heating_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar end) as heating_fuel,
  
  replace(replace(replace(max(case when question_shortened = 'heating_condition' then answers::varchar end),'[',''),']',''),'"','')::varchar as heating_condition,
  replace(replace(replace(max(case when question_shortened = 'heating_age' then answers::varchar end),'[',''),']',''),'"','')::varchar as heating_age,

  lower(case when 
    replace(replace(replace(max(case when question_shortened = 'wh_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Natural gas' then 'Gas' 
  when replace(replace(replace(max(case when question_shortened = 'wh_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Electric resistance' then 'Electric'
  when replace(replace(replace(max(case when question_shortened = 'wh_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar = 'Fuel oil' then 'Oil'
  else replace(replace(replace(max(case when question_shortened = 'wh_fuel' then answers::varchar end),'[',''),']',''),'"','')::varchar end) as wh_fuel,
 
  replace(replace(replace(max(case when question_shortened = 'wh_condition' then answers::varchar end),'[',''),']',''),'"','')::varchar as wh_condition,
  replace(replace(replace(max(case when question_shortened = 'wh_age' then answers::varchar end),'[',''),']',''),'"','')::varchar as wh_age,
  replace(replace(replace(max(case when question_shortened = 'other_appliances' then answers::varchar end),'[',''),']',''),'"','')::varchar as other_appliances,
  replace(replace(replace(max(case when question_shortened = 'existing_upgrades' then answers::varchar end),'[',''),']',''),'"','')::varchar as existing_upgrades,
  
  replace(replace(replace(max(case when question_shortened = 'addtl_notes' then answers::varchar end),'[',''),']',''),'"','')::varchar as addtl_notes

  from flattened
  group by 1,2,3,4,5,6,7
)

select * 

  from final
  

