-- System Design database schema (PostgreSQL / Supabase).
--
-- Source of each table:
--   [seen]     columns and types read from screenshots of the Retool DB (customers, proposals, systems, incentives,
--              incentive limits, invoice line items, equipment, prices) or from an export (projects_new.csv header + values).
--   [inferred] columns taken from how the Retool queries and workflows use the table (houses, line items, invoices,
--              labor, permits, AHRI, jurisdiction rules, maintenance plans). Types are best guesses.
--   [app]      added by this app, not in Retool: marked "APP" below. Remove or move them once the real source is known.
-- Postgres enums in Retool (shown as USER-DEFINED) are plain text here; their values are not known.
-- Safe to run more than once (create if not exists). `npm run db:seed -- --reset` drops and recreates everything.

create sequence if not exists app_id_seq start 100000 increment 1000;

/* ------------------------------------------------------------------ */
/* People, homes, projects                                             */
/* ------------------------------------------------------------------ */

create table if not exists customers_new (                                  -- [seen]
  id                      integer primary key,
  first_name              text not null default '',
  last_name               text not null default '',
  annual_gross_income     double precision,
  income_verification     text,                    -- enum in Retool
  incentive_notes         text,
  referred_by_customer_id integer references customers_new(id),
  hcp_customer_id         text,
  pipedrive_customer_id   integer,
  qbo_customer_id         text,
  salesforce_account_id   text,
  tabs_customer_id        text
);

create table if not exists houses_new (                                     -- [seen]
  id                    integer primary key,
  address               text,
  addtl_notes           text,
  attic                 text,                    -- enum
  city                  text,
  colorado_details      json,
  comfort_notes         text,
  county                text,
  crawlspace            text,                    -- enum
  created_at            timestamptz not null default now(),
  customer_id           integer references customers_new(id),
  electric_utility      text,
  electrical_acct_num   text,
  electrical_meter_num  text,
  existing_system_notes text,
  gas_acct_num          text,
  gas_meter_num         text,
  gas_utility           text,
  google_place_id       text,
  has_paperless_billing boolean,
  heating_load          integer,
  home_features         text,                    -- text in Retool; the app stores the list joined with "; "
  home_type             text,
  hvac_profile          json,
  insulation_notes      text,
  is_primary_residence  boolean,
  load_calc             text,                    -- enum
  manual_d              text,                    -- enum
  manual_j              text,                    -- enum; the app writes 'complete' or null
  manual_s              text,                    -- enum
  market                text,
  market_id             integer,
  massachusetts_details json,
  move_in_date          date,
  move_in_year          double precision,
  num_ppl               integer,
  num_rooms             double precision,
  overburdened          boolean,
  renter                boolean,
  salesforce_house_id   text,
  special_considerations text,                   -- text in Retool; the app stores the list joined with "; "
  sq_footage            double precision,
  state                 text,
  territory             text,
  unfinished_basement   text,                    -- enum (name cut off in the screenshot)
  units                 double precision,
  utility_customer_name text,
  ventilation_type      text,
  xcel_whole_home_eligible boolean,              -- name cut off in the screenshot
  year_built            double precision,
  zipcode               text
);

create table if not exists users (                                          -- APP: Retool's project_manager is a user id
  id   integer primary key,
  name text not null
);
-- APP: sign-in. Accounts are Supabase Auth users; this table keeps the app's role and blocked flag, linked by auth_user_id.
-- Roles: 'admin' (can manage the team) and 'user'. (password_hash is no longer used.)
alter table users add column if not exists email text;
alter table users add column if not exists password_hash text;
alter table users add column if not exists role text not null default 'user';
alter table users alter column role set default 'user';
update users set role = 'user' where role = 'staff';
-- pending: the person made a Supabase account nobody invited; an admin approves them on the Team page
alter table users add column if not exists pending boolean not null default false;
alter table users add column if not exists active boolean not null default true;
alter table users add column if not exists last_login_at timestamptz;
create unique index if not exists users_email_key on users (lower(email));
alter table users add column if not exists auth_user_id uuid;
create unique index if not exists users_auth_user_key on users (auth_user_id);

create table if not exists projects_new (                                   -- [seen: projects_new.csv]
  id                        integer primary key,
  project_status            text not null default 'open',
  inflow_link               text,
  house_id                  integer references houses_new(id),
  created_at                timestamptz not null default now(),
  closed_at                 timestamptz,
  pipedrive_deal_id         integer,
  pipedrive_project_id      integer,
  prospective_systems       jsonb not null default '{}',
  customer_id               integer references customers_new(id),
  hca                       text,
  pipedrive_deal_title      text not null default '',
  zone_key                  integer,
  timeline                  text,
  pricing_structure         text,
  finalized_proposal_id     integer,               -- no FK: proposals_new references the project
  project_retro             jsonb not null default '{}',
  inflow_sales_order_id     text,
  budget                    text,
  hcp_job_id                text,
  install_date              date,
  financing                 text,
  handoff_notes             jsonb not null default '{}',   -- {"handoff_notes": "..."}
  project_ready             boolean,
  notes                     text,
  spiff_data                jsonb not null default '{}',
  project_manager           integer references users(id),
  salesforce_opportunity_id text,
  project_checklist         jsonb not null default '{}',
  bypass_fulfillment_date_check boolean not null default false,
  lender                    jsonb,
  financing_amounts         jsonb,                 -- [{"amount": 6000, "lender": "Synchrony"}]
  kraken_bonuses            jsonb,
  quality                   jsonb,
  project_summary           text,
  install_capacity_warning  boolean not null default false,
  surge_protection          text,
  qbo_job_id                text,
  rmi_calculator_results    jsonb,
  signnow_embed_link        text,
  signnow_document_id       text,
  signnow_embed_id          text,
  signnow_proposal_id       text,
  signnow_link_expires_at   timestamptz,
  project_blocker           text,
  end_install_date          date,
  signnow_pending_snapshot  jsonb
);
create index if not exists projects_customer_idx on projects_new(customer_id);

-- APP: fields the Overview screen shows that are not in customers_new / projects_new (they come from Salesforce in Retool),
-- plus the manual project statuses and the last-changed time the list is sorted by.
create table if not exists project_profile (
  project_id           integer primary key references projects_new(id) on delete cascade,
  email                text not null default '',
  phone                text not null default '',
  source               text not null default '',
  source_detail        text not null default '',
  referrer             text not null default '',
  referral_balance     numeric not null default 0,
  maintenance_interest text not null default '',
  systems_interest     jsonb not null default '[]',
  statuses             jsonb not null default '{}',
  nwco_details         jsonb not null default '{}',   -- no matching column in houses_new
  updated_at           timestamptz not null default now()
);

-- APP: what is in the home today (Retool keeps these as 'active' rows of systems_new).
create table if not exists existing_systems (
  project_id   integer primary key references projects_new(id) on delete cascade,
  heating      jsonb not null default '{}',
  cooling      jsonb not null default '{}',
  water_heater jsonb not null default '{}',
  panel        jsonb not null default '{}',
  subpanels    jsonb not null default '[]',
  other        jsonb not null default '[]',
  notes        text not null default ''
);

/* ------------------------------------------------------------------ */
/* Design: proposals, systems, line items                              */
/* ------------------------------------------------------------------ */

create table if not exists proposals_new (                                  -- [seen]
  id                   integer primary key,
  project_id           integer not null references projects_new(id) on delete cascade,
  house_id             integer references houses_new(id),
  nickname             text,
  indicative           boolean not null default false,
  proposal_status      text not null default 'pending',   -- enum: pending | out for review | out for signature | finalized | rejected
  additional_terms     text,
  deposit_amount       jsonb,
  proposal_created_at  timestamptz not null default now(),
  proposal_link        text,
  proposal_sent_at     timestamptz,
  proposal_signed_at   timestamptz,
  signature_request_id text,
  signed_snapshot      jsonb,
  tabs_contract_id     text,
  apitemplate_url      text,
  document_group_id    text,
  target_margin        numeric                            -- APP: proposal-level margin (Retool keeps it per system)
);
create index if not exists proposals_project_idx on proposals_new(project_id);

create table if not exists systems_new (                                    -- [seen]
  id                      integer primary key,
  proposal_id             integer not null references proposals_new(id) on delete cascade,
  house_id                integer references houses_new(id),
  system_type             text not null,
  system_status           text not null default 'proposed',
  prior_status            text,
  system_nickname         text,
  system_type_detail      json,
  ahri_id                 integer,
  heating_load_coverage   text,
  sizing_graph            json,
  target_margin           numeric,
  rebate_eligibility_type text,
  rebate_effective_date   date,
  system_created_at       timestamptz not null default now(),
  updated_at              timestamp,
  -- Engine additional data at the top level. APP keys under "_app": scope, input (the add/edit modal payload), change_order, stock_alert
  additional_data         json
);
create index if not exists systems_proposal_idx on systems_new(proposal_id);

create table if not exists line_items_new (                                 -- [seen]
  id                     integer primary key,
  system_id              integer not null references systems_new(id) on delete cascade,
  line_order             integer not null default 0,     -- APP: display order
  line_item_type         text,                           -- enum
  description            text,
  quantity               integer,
  price_actual           double precision,
  additional_data        json,                           -- the app keeps cost, note, circuit, assigned_units and branch_box here
  adjustment_explanation text,
  adjustment_reason      text,
  change_order_details   json,
  change_order_status    text,                           -- enum (name cut off in the screenshot)
  discount_id            integer,
  equipment_id           integer,
  equipment_provider     text,                           -- enum (name cut off)
  incentive_id           integer,
  incentive_recipient    text,                           -- enum (name cut off)
  labor_id               integer,
  line_item_created_at   timestamptz not null default now(),
  location               text,
  maintenance_plan_id    integer,
  manually_added         boolean,
  margin_amount          double precision,
  margin_percent         numeric,
  margin_to_include      boolean,
  permit_id              integer,
  permit_notes           text,
  permit_owner           text,
  permit_price           numeric,
  permit_status          text,                           -- enum
  prior_status           text,
  rebate_status          text,                           -- enum
  rebate_submitted_at    timestamptz,
  serial_number          text,
  show_in_proposal       boolean,
  state                  text,
  status                 text,                           -- enum
  zone_index             integer
);
create index if not exists line_items_system_idx on line_items_new(system_id);

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

create table if not exists invoices_new (                                   -- [seen]
  id                     integer primary key,
  project_id             integer not null references projects_new(id) on delete cascade,
  system_id              integer,
  invoice_id             text,
  invoice_type           text,                           -- enum: First Deposit | Second Deposit | Final Invoice
  invoice_status         text,                           -- not sent | open | paid | void | draft
  invoice_amount         double precision,
  invoice_created_at     timestamptz not null default now(),
  payment_type           text,                           -- enum
  finalizing_method      text,                           -- enum
  priority_status        text,                           -- enum
  memo                   text,
  footer                 text,
  notes                  text,
  customer_holdback      boolean,
  paying_upfront         boolean,
  estm_receival_date     date,
  mail_tracking_number   text,
  qbo_invoice_id         text,
  stripe_invoice_id      text,
  stripe_invoice_number  text,
  -- APP: state the demo keeps for the approve, send and pay steps (Stripe owns this in Retool)
  evergreen              boolean not null default false,
  approved_at            timestamptz,
  sent_at                timestamptz,
  paid_at                timestamptz
);
create index if not exists invoices_project_idx on invoices_new(project_id);

create table if not exists invoice_line_items_new (                         -- [seen]
  id                integer primary key,
  invoice_id        integer not null references invoices_new(id) on delete cascade,
  line_item_type    text,                           -- enum in Retool
  name              text,
  amount            double precision,
  system_id         integer,
  qbo_receivable_id text
);
create index if not exists invoice_lines_invoice_idx on invoice_line_items_new(invoice_id);

create table if not exists deposit_config (                                 -- APP
  project_id        integer primary key references projects_new(id) on delete cascade,
  first_deposit_pct numeric not null default 0.5,
  first_deposit_amount_custom numeric not null default 0,
  first_card_fees   boolean not null default false,
  final_card_fees   boolean not null default false,
  upfront_discount  boolean not null default false
);

/* ------------------------------------------------------------------ */
/* Reference data read by the engine. `extra` holds engine fields that have no column here. */
/* ------------------------------------------------------------------ */

create table if not exists equipment_new (                                  -- [seen, top of the list was cut off]
  id                    integer primary key,
  active                boolean,
  additional_equipment  jsonb,                          -- the engine reads this as additional_equipment_ids
  afue                  double precision,
  capacity_gallons      double precision,
  cdj_endpoint          text,
  cfm                   text,
  decibels              integer,
  depth                 numeric,
  electrical_requirements jsonb,
  equipment_name        text,
  equipment_type        text,                           -- enum
  fan_type              text,                           -- enum
  gph                   integer,
  heating_tonnage       double precision,
  height                numeric,
  hpwh_voltage          text,                           -- enum
  inflow_id             text,
  integrated_tmv        boolean,
  inventory_status      jsonb,
  is_energystar         boolean,
  labor_id              integer,
  manufacturer          text,                           -- enum
  max_indoor_units      integer,
  mitsu_stockout        boolean,
  model_number          text,
  model_series          text,                           -- enum
  output_btu            double precision,
  power                 text,
  provider              text,                           -- enum
  refrigerant           text,
  rla                   text,
  submittal             text,
  supplier_inventory    jsonb,
  uef                   double precision,
  weight                double precision,
  width                 numeric,
  extra                 jsonb not null default '{}'
);
create index if not exists equipment_type_idx on equipment_new(equipment_type);

create table if not exists labor_new (                                      -- [seen]
  id integer primary key, category text, circuit_amps integer, circuit_voltage integer, labor_hours numeric, name text, subcategory text,
  extra jsonb not null default '{}'
);

create table if not exists prices_new (                                     -- [seen]
  id                 integer primary key,
  active_date        date,
  circuit_price_limit numeric,
  circuit_price_type text,                              -- enum
  created_at         timestamptz,
  equipment_id       integer,
  inactive_date      date,
  labor_id           integer,
  maintenance_plan_id integer,
  price              numeric,
  system_type        text,                              -- enum: ducted | ductless | mixed
  territory          text,                              -- enum
  updated_at         timestamptz,
  updated_by         text,
  extra              jsonb not null default '{}'
);
create index if not exists prices_equipment_idx on prices_new(equipment_id);
create index if not exists prices_labor_idx on prices_new(labor_id);

create table if not exists maintenance_plans_new (                          -- [seen]
  id integer primary key, labor_warranty_yrs integer, name text, plan_level text, type text,   -- plan_level and type are enums
  extra jsonb not null default '{}'
);

create table if not exists ahri_certifications_new (                        -- [seen]
  id integer primary key, ahri_number text, capacity_5 double precision, capacity_json json, certification_type text, certification_type_detail text,
  child_equipment_id text, cooling_95 double precision, cop_5 double precision, eer double precision, eer_2 double precision, energystar_id text,
  fudge_notes text, furnace_id text, fuzzy_child_id_opt text, fuzzy_furnace_id_opt text, fuzzy_parent_id_opt text, heating_47 double precision,
  heating_5 double precision, heating_neg10 double precision, heating_neg5 double precision, hspf double precision, hspf_2 double precision,
  is_cold_climate boolean, is_energystar boolean, is_mass_save_approved boolean, is_variable_speed boolean, parent_equipment_id text,
  seer double precision, seer_2 double precision, specificity_rank_opt integer, extra jsonb not null default '{}'
);

create table if not exists jurisdiction_rules_new (                         -- [seen]
  id serial primary key, city varchar, criteria jsonb, description varchar, equipment_id integer, is_active boolean, labor_id integer,
  multiplier_type varchar, multiplier_value varchar, state varchar, extra jsonb not null default '{}'
);

create table if not exists permits_new (                                    -- [seen]
  id integer primary key, name text, permit_type text, jurisdiction text, jurisdiction_type text, price jsonb, extra jsonb not null default '{}'
);

create table if not exists incentives_new (                                 -- [seen]
  id                   integer primary key,
  active_date          date,
  affects_tax_credit   boolean,
  created_at           timestamptz,
  eligibility_questions json,
  entity_type          text,                            -- enum
  finance_fee          integer,
  inactive_date        date,
  incentive_criteria   json,
  incentive_type       text,                            -- enum
  link                 text,
  name                 text,
  program              text,                            -- enum
  recipient            text,                            -- enum
  system_type          text,                            -- enum
  updated_at           timestamptz,
  updated_by           text,
  extra                jsonb not null default '{}'
);

create table if not exists incentive_limits_new (                           -- [seen]
  id                   integer primary key,
  description          text,
  eligibility_questions json,
  incentive_ids        json,
  limit_amount         integer,
  limit_number         double precision,
  name                 text,
  timeframe            text,                            -- enum
  extra                jsonb not null default '{}'
);

/* ------------------------------------------------------------------ */
/* Lookup and log tables from Retool that the app does not read yet     */
/* ------------------------------------------------------------------ */

create table if not exists ahri_configurations (                          -- [seen] the Base Designs behind "Quick Add"
  id integer primary key, active boolean not null default true, ahri_number text, idu integer, nickname text, odu integer,
  pricing_structure text,                                -- enum
  system_type text,                                      -- enum: hvac | water heater
  thermostat integer
);

create table if not exists discounts_new (id integer primary key, discount_type text);   -- [seen] enum

create table if not exists utilities_new (                                  -- [seen]
  id integer primary key, bayou_utility_name text, is_electrical boolean, is_gas boolean, rewiring_america_utility_name text, utility_name text
);

create table if not exists hdd_new (                                        -- [seen]
  id integer primary key, assumptions json, hdd_created_at timestamptz, hdd_design double precision, hdd_max double precision, house_id integer,
  hp_savings jsonb, hpwh_savings jsonb, sizing_method text, sizing_type text, temp_table json
);

create table if not exists zipcode_mapping (                                -- [seen]
  id integer primary key, city text, county text, install_territory text, manual_j_required boolean, state text, territory text,
  territory_id integer, weather_station text, zipcode integer
);

create table if not exists referral_credits (                               -- [seen]
  id integer primary key, ambassador_id integer, balance text, email text, first_name text, last_name text,
  referral_contact_created_at timestamptz, referred_by_email text                         -- last two names cut off in the screenshot
);

create table if not exists timestamps_new (                                 -- [seen] audit log of changes
  id integer primary key, apt_change_order_id integer, apt_project_id text, callback_id integer, change_category text, changed_by text,
  changed_by_user text, field_name text, inspection_id integer, invoice_id integer, line_item_id integer, market text, new_value text, notes text,
  previous_value text, project_id integer, rebate_id integer, source text, system_id integer, "timestamp" timestamptz
);

-- Security: the browser holds Supabase's publishable key, which can reach every table in "public" through Supabase's REST API.
-- RLS on with no policies means the browser roles (anon, authenticated) can read or change nothing here.
-- The app's API connects as the table owner, which RLS does not restrict, so the app itself is unaffected.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- Supabase Auth -> users table, kept in step by the database itself:
--   account created  -> a users row with role 'user'. If an admin already invited that email, the account is linked to that row
--                       (and keeps the role the admin chose). Anyone else starts pending until an admin approves them.
--   email changed    -> the users row gets the new email.
--   account deleted  -> access removed; the name stays because projects may list the person as project manager.
-- Only runs where Supabase's auth schema exists (skipped on a plain local Postgres).
create or replace function public.handle_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare existing integer;
begin
  if new.email is null then return new; end if;
  select id into existing from public.users where lower(email) = lower(new.email) limit 1;
  if existing is not null then
    update public.users set auth_user_id = new.id where id = existing;
  else
    insert into public.users (id, name, email, role, active, pending, auth_user_id)
    values (nextval('app_id_seq'),
            coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
            lower(new.email), 'user', false, true, new.id);
  end if;
  return new;
end $$;

create or replace function public.handle_auth_user_email_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and not exists (select 1 from public.users where lower(email) = lower(new.email) and auth_user_id is distinct from new.id) then
    update public.users set email = lower(new.email) where auth_user_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.handle_auth_user_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.users set email = null, auth_user_id = null, active = false, pending = false, role = 'user' where auth_user_id = old.id;
  return old;
end $$;

-- trigger functions are not meant to be called through Supabase's API
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;
revoke all on function public.handle_auth_user_email_changed() from public, anon, authenticated;
revoke all on function public.handle_auth_user_deleted() from public, anon, authenticated;

do $$
begin
  if to_regclass('auth.users') is null then return; end if;
  execute 'create or replace trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user_created()';
  execute 'create or replace trigger on_auth_user_email_changed after update of email on auth.users for each row when (old.email is distinct from new.email) execute function public.handle_auth_user_email_changed()';
  execute 'create or replace trigger on_auth_user_deleted after delete on auth.users for each row execute function public.handle_auth_user_deleted()';
  -- accounts made before the trigger existed: link them, or add them as pending
  update public.users u set auth_user_id = a.id from auth.users a
   where u.auth_user_id is null and a.email is not null and lower(u.email) = lower(a.email)
     and not exists (select 1 from public.users x where x.auth_user_id = a.id);
  insert into public.users (id, name, email, role, active, pending, auth_user_id)
  select nextval('app_id_seq'),
         coalesce(nullif(a.raw_user_meta_data->>'full_name', ''), nullif(a.raw_user_meta_data->>'name', ''), split_part(a.email, '@', 1)),
         lower(a.email), 'user', false, true, a.id
    from auth.users a
   where a.email is not null
     and not exists (select 1 from public.users u where u.auth_user_id = a.id or lower(u.email) = lower(a.email));
end $$;
