-- ============================================================================
-- UTC CPQ — seed data (Section 10 + Addendum A.6)
-- Run against a FRESH database after migrations. Idempotent (ON CONFLICT /
-- WHERE NOT EXISTS), so re-running will not duplicate rows.
--
-- This file seeds CATALOG + DEMO data only. It does NOT create auth users —
-- create the first OWNER via the Supabase dashboard + the promote snippet in
-- the README (Addendum A.6).
--
-- All prices are PLACEHOLDER 0.00 — the client enters real prices later via the
-- Admin price-list editor (TODO).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- app_config — company email-domain allow-list for signup (Addendum A.2)
-- Default = [] (empty) which means "allow ANY domain" so you can test signups
-- immediately. TODO: replace with your real domain(s), e.g.
--   update public.app_config
--     set value = '["unitedtradeco.com"]'::jsonb
--     where key = 'allowed_email_domains';
-- ----------------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('allowed_email_domains', '[]'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- FX rates — starter placeholders; Admin edits these in the app. (Section 5)
-- ----------------------------------------------------------------------------
insert into public.fx_rates (from_currency, to_currency, rate) values
  ('EUR','EGP', 54.000000),
  ('USD','EGP', 49.500000),
  ('EUR','USD', 1.090000),
  ('USD','EUR', 0.917000),
  ('EGP','EUR', 0.018500),
  ('EGP','USD', 0.020200)
on conflict (from_currency, to_currency) do nothing;

-- ----------------------------------------------------------------------------
-- Brands (13 active + 2 placeholder EU brands marked inactive)
-- ----------------------------------------------------------------------------
insert into public.brands (name, origin_country, brand_type, pricing_modes, default_buy_currency, active, notes) values
  -- Own brand
  ('UTC.stav', 'Turkey (+ Egypt)', 'OWN', '{WAREHOUSE}', 'EUR', true,
     'UTC own manufacturing brand, made in Turkey + Egypt.'),
  -- European brands
  ('Roxell',   'Belgium',     'EUROPEAN', '{WAREHOUSE,AGENT_COMMISSION}', 'MIXED', true,
     'Buy currency EUR/USD depending on order. Sold from warehouse or as agent.'),
  ('Zucami',   'Spain',       'EUROPEAN', '{AGENT_COMMISSION}', 'EUR', true,
     'Cage systems are house-spec custom; agent/commission only, quoted per house.'),
  ('Skov',     'Denmark',     'EUROPEAN', '{WAREHOUSE,AGENT_COMMISSION}', 'EUR', true,
     'Full house climate systems; mix of warehouse and agent. Inlets/motors auto-controlled.'),
  ('Pericoli', 'Italy',       'EUROPEAN', '{WAREHOUSE}', 'EUR', true,
     'Fans and heaters, warehouse stock.'),
  ('Hato',     'Netherlands', 'EUROPEAN', '{WAREHOUSE,AGENT_COMMISSION}', 'EUR', true,
     'LED lighting + controller systems; mix of warehouse and agent.'),
  ('Multifan', 'Netherlands', 'EUROPEAN', '{WAREHOUSE}', 'EUR', true,
     'Fan brand, parallel to Pericoli for easy comparison.'),
  ('European Brand 8', null,  'EUROPEAN', '{}', 'EUR', false,
     'TODO: client to supply name/origin/products.'),
  ('European Brand 9', null,  'EUROPEAN', '{}', 'EUR', false,
     'TODO: client to supply name/origin/products.'),
  -- Egyptian brands (fixed monthly price list, warehouse stock, EGP default)
  ('Tabreed',    'Egypt', 'EGYPTIAN', '{FIXED_MONTHLY}', 'EGP', true, 'Cooling pads.'),
  ('ELNILE',     'Egypt', 'EGYPTIAN', '{FIXED_MONTHLY}', 'EGP', true, 'Cooling pads + egg trays.'),
  ('Falcon',     'Egypt', 'EGYPTIAN', '{FIXED_MONTHLY}', 'EGP', true, 'Cooling pads.'),
  ('Huhtamaki',  'Egypt', 'EGYPTIAN', '{FIXED_MONTHLY}', 'EGP', true, 'Local Egyptian entity; egg trays.'),
  ('EPEuropack', 'Egypt', 'EGYPTIAN', '{FIXED_MONTHLY}', 'EGP', true, 'Egg trays.')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------------------
insert into public.products (brand_id, name, category, unit, poultry_types, pricing_mode, installation_separate, notes)
select b.id, p.name,
       p.category::product_category,
       p.unit::unit_type,
       p.poultry_types::poultry_type[],
       p.pricing_mode::pricing_mode,
       p.installation_separate,
       p.notes
from (values
  -- UTC.stav -------------------------------------------------------------
  ('UTC.stav','Feeding line','FEEDING','PER_METER','{BROILER,LAYER}','WAREHOUSE', true,
     'Rate varies by house capacity / bird count — capture capacity as a line note.'),
  ('UTC.stav','Drinking line','DRINKING','PER_METER','{BROILER,LAYER}','WAREHOUSE', true, null),
  ('UTC.stav','Silo / hopper','SILO','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('UTC.stav','Controller & sensor system','CLIMATE_CONTROL','PER_UNIT','{ALL}','WAREHOUSE', false,
     'Turkey-made; comparable to Skov.'),
  ('UTC.stav','Climate control system','CLIMATE_CONTROL','PER_HOUSE','{ALL}','WAREHOUSE', false, null),
  ('UTC.stav','Heater','HEATER','PER_UNIT','{ALL}','WAREHOUSE', false, 'Egyptian-made; warehouse stock.'),
  ('UTC.stav','Aqua Maker','COOLING_PAD','PER_UNIT','{ALL}','WAREHOUSE', false,
     'PVC frame holding cooling-pad paper. TODO: confirm pricing unit & target house type with client.'),
  -- Roxell (dual-mode handled via variants) ------------------------------
  ('Roxell','Feeding line','FEEDING','PER_METER','{ALL}','WAREHOUSE', true, 'Dual: warehouse per meter / agent per house.'),
  ('Roxell','Drinking line','DRINKING','PER_METER','{ALL}','WAREHOUSE', true, 'Dual: warehouse per meter / agent per house.'),
  ('Roxell','Silo','SILO','PER_UNIT','{ALL}','WAREHOUSE', false, 'Dual: warehouse per unit / agent per house.'),
  ('Roxell','Spare parts','SPARE_PART','PER_COMPONENT','{ALL}','WAREHOUSE', false, null),
  -- Zucami (agent only) --------------------------------------------------
  ('Zucami','Layer cage system','CAGE','PER_HOUSE','{LAYER}','AGENT_COMMISSION', false, null),
  ('Zucami','Broiler cage system','CAGE','PER_HOUSE','{BROILER}','AGENT_COMMISSION', false, null),
  ('Zucami','Breeder cage system','CAGE','PER_HOUSE','{BREEDER}','AGENT_COMMISSION', false, null),
  ('Zucami','Silo (project)','SILO','PER_HOUSE','{ALL}','AGENT_COMMISSION', false, null),
  -- Skov -----------------------------------------------------------------
  ('Skov','Full house climate system','CLIMATE_CONTROL','PER_HOUSE','{ALL}','WAREHOUSE', false, 'Dual: warehouse / agent, per house.'),
  ('Skov','Controller unit','CLIMATE_CONTROL','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Skov','Sensor set','CLIMATE_CONTROL','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Skov','Air inlet set','CLIMATE_CONTROL','PER_UNIT','{ALL}','WAREHOUSE', false, 'Opens/closes automatically via control screen.'),
  ('Skov','Motor set','CLIMATE_CONTROL','PER_UNIT','{ALL}','WAREHOUSE', false, 'Opens/closes automatically via control screen.'),
  -- Pericoli -------------------------------------------------------------
  ('Pericoli','Tunnel fan','FAN','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Pericoli','Side fan','FAN','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Pericoli','Heater','HEATER','PER_UNIT','{ALL}','WAREHOUSE', false, 'Warehouse stock.'),
  -- Hato -----------------------------------------------------------------
  ('Hato','LED lighting system (fixtures + controller)','LIGHTING','PER_HOUSE','{ALL}','WAREHOUSE', false, 'Dual: warehouse / agent, per house.'),
  ('Hato','LED fixture','LIGHTING','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Hato','Lighting controller','LIGHTING','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  -- Multifan -------------------------------------------------------------
  ('Multifan','Tunnel fan','FAN','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  ('Multifan','Side fan','FAN','PER_UNIT','{ALL}','WAREHOUSE', false, null),
  -- Egyptian brands ------------------------------------------------------
  ('Tabreed','Cooling pad','COOLING_PAD','PER_UNIT','{ALL}','FIXED_MONTHLY', false, null),
  ('ELNILE','Cooling pad','COOLING_PAD','PER_UNIT','{ALL}','FIXED_MONTHLY', false, null),
  ('ELNILE','Plastic egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null),
  ('ELNILE','Cardboard egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null),
  ('Falcon','Cooling pad','COOLING_PAD','PER_UNIT','{ALL}','FIXED_MONTHLY', false, null),
  ('Huhtamaki','Plastic egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null),
  ('Huhtamaki','Cardboard egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null),
  ('EPEuropack','Plastic egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null),
  ('EPEuropack','Cardboard egg tray','EGG_TRAY','PER_UNIT','{LAYER}','FIXED_MONTHLY', false, null)
) as p(brand_name, name, category, unit, poultry_types, pricing_mode, installation_separate, notes)
join public.brands b on b.name = p.brand_name
on conflict (brand_id, name) do nothing;

-- Cast text columns to their enum types (the VALUES list above is text).
-- (Postgres performs the implicit cast on insert because the target columns are
-- typed; the array literals '{...}' cast to poultry_type[] automatically.)

-- ----------------------------------------------------------------------------
-- Pricing variants for dual-mode products (4.2.1)
-- ----------------------------------------------------------------------------
insert into public.product_pricing_variants (product_id, pricing_mode, unit, label)
select p.id, v.pricing_mode::pricing_mode, v.unit::unit_type, v.label
from (values
  ('Roxell','Feeding line','WAREHOUSE','PER_METER','Warehouse — per meter'),
  ('Roxell','Feeding line','AGENT_COMMISSION','PER_HOUSE','Agent — per house'),
  ('Roxell','Drinking line','WAREHOUSE','PER_METER','Warehouse — per meter'),
  ('Roxell','Drinking line','AGENT_COMMISSION','PER_HOUSE','Agent — per house'),
  ('Roxell','Silo','WAREHOUSE','PER_UNIT','Warehouse — per unit'),
  ('Roxell','Silo','AGENT_COMMISSION','PER_HOUSE','Agent — per house'),
  ('Skov','Full house climate system','WAREHOUSE','PER_HOUSE','Warehouse — per house'),
  ('Skov','Full house climate system','AGENT_COMMISSION','PER_HOUSE','Agent — per house'),
  ('Hato','LED lighting system (fixtures + controller)','WAREHOUSE','PER_HOUSE','Warehouse — per house'),
  ('Hato','LED lighting system (fixtures + controller)','AGENT_COMMISSION','PER_HOUSE','Agent — per house')
) as v(brand_name, product_name, pricing_mode, unit, label)
join public.brands b   on b.name = v.brand_name
join public.products p on p.brand_id = b.id and p.name = v.product_name
on conflict (product_id, label) do nothing;

-- ----------------------------------------------------------------------------
-- Placeholder price entries (all 0.00) — Section 10 note
-- ----------------------------------------------------------------------------

-- (a) For every pricing VARIANT: a 0.00 UNIT_PRICE (sell price) in EUR.
insert into public.price_list_entries (product_id, pricing_variant_id, currency, value_type, amount)
select v.product_id, v.id, 'EUR', 'UNIT_PRICE', 0
from public.product_pricing_variants v
where not exists (
  select 1 from public.price_list_entries pe
  where pe.pricing_variant_id = v.id and pe.currency = 'EUR' and pe.value_type = 'UNIT_PRICE'
);

-- (b) For AGENT variants: also a 0.00 COMMISSION_PERCENT entry (internal).
insert into public.price_list_entries (product_id, pricing_variant_id, currency, value_type, amount)
select v.product_id, v.id, 'EUR', 'COMMISSION_PERCENT', 0
from public.product_pricing_variants v
where v.pricing_mode = 'AGENT_COMMISSION'
  and not exists (
    select 1 from public.price_list_entries pe
    where pe.pricing_variant_id = v.id and pe.value_type = 'COMMISSION_PERCENT'
  );

-- (c) For SINGLE-mode products (no variants): a 0.00 UNIT_PRICE in the brand's
--     natural currency (EGP for Egyptian brands, else EUR).
insert into public.price_list_entries (product_id, currency, value_type, amount)
select p.id,
       (case when b.brand_type = 'EGYPTIAN' then 'EGP' else 'EUR' end)::currency_code,
       'UNIT_PRICE', 0
from public.products p
join public.brands b on b.id = p.brand_id
where not exists (select 1 from public.product_pricing_variants v where v.product_id = p.id)
  and not exists (select 1 from public.price_list_entries pe where pe.product_id = p.id and pe.value_type = 'UNIT_PRICE')
  and b.active = true;

-- (d) For SINGLE-mode AGENT products (e.g. Zucami): also a 0.00 commission %.
insert into public.price_list_entries (product_id, currency, value_type, amount)
select p.id, 'EUR', 'COMMISSION_PERCENT', 0
from public.products p
where p.pricing_mode = 'AGENT_COMMISSION'
  and not exists (select 1 from public.product_pricing_variants v where v.product_id = p.id)
  and not exists (select 1 from public.price_list_entries pe where pe.product_id = p.id and pe.value_type = 'COMMISSION_PERCENT');

-- ----------------------------------------------------------------------------
-- Demo customers (Section 10.5). owner_user_id left null → visible to ADMIN/OWNER.
-- ----------------------------------------------------------------------------
insert into public.customers (company_name, country, region, contact_name, contact_email, contact_phone, preferred_currency, notes) values
  ('Al Nour Farms',       'Saudi Arabia', 'MIDDLE_EAST', 'Khalid Al Nour', 'khalid@alnourfarms.example', '+966 50 000 0001', 'USD', 'Large broiler operation, expanding capacity.'),
  ('Delta Poultry Co.',   'Egypt',        'NORTH_AFRICA', 'Mona Hassan',    'mona@deltapoultry.example', '+20 100 000 0002', 'EGP', 'Prefers Egyptian-brand cooling pads & egg trays.'),
  ('Nairobi Hatchery Ltd','Kenya',        'EAST_AFRICA',  'James Otieno',   'james@nairobihatch.example', '+254 700 000003', 'USD', 'Hatchery; interested in climate control.'),
  ('Gulf Agri Group',     'UAE',          'MIDDLE_EAST',  'Sara Al Mansoori','sara@gulfagri.example',     '+971 50 000 0004', 'EUR', 'Multi-house layer project under planning.'),
  ('Casablanca Farms',    'Morocco',      'NORTH_AFRICA', 'Youssef Benali', 'youssef@casafarms.example', '+212 600 000005', 'EUR', 'New entrant, evaluating full-house systems.')
on conflict (company_name) do nothing;

commit;
