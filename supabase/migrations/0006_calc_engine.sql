-- ============================================================================
-- UTC CPQ — 0006 House Sizing & Auto-Calculation Engine (Addenda B–F)
-- Adds editable settings + equipment-spec tables, a per-quote calc snapshot,
-- RLS, and the authoritative seed (Addendum D specs + C.13/E.1 defaults).
--
-- DESIGN PRINCIPLE (Addendum B.0): formulas live in code; every CONSTANT lives
-- here in editable tables. Seed values are DEFAULTS, all tunable by Admin/Owner.
--
-- This whole file is safe to paste into the Supabase SQL editor on the existing
-- project (it only ADDS objects). Re-runnable: guarded with IF NOT EXISTS /
-- ON CONFLICT / WHERE NOT EXISTS.
-- ============================================================================

do $$ begin
  create type fan_type as enum ('TUNNEL', 'EXHAUST', 'SIDE', 'CIRCULATION', 'WINTER');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- calc_settings — every tunable constant (key/value), editable by admins
-- ----------------------------------------------------------------------------
create table if not exists public.calc_settings (
  key         text primary key,
  value       numeric,                 -- numeric constant (null = "not set / pending")
  unit        text,
  category    text,
  description text,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Equipment-spec tables (capacities entered from supplier catalogs)
-- ----------------------------------------------------------------------------
create table if not exists public.fan_models (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  fan_type     fan_type not null,
  diameter_in  numeric,
  capacity_m3h numeric,                 -- null = "capacity not set — calc refuses to run"
  power_hp     numeric,
  brand_id     uuid references public.brands (id) on delete set null,
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.cooling_pad_models (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  sheet_l_m        numeric not null default 1.5,
  sheet_w_m        numeric not null default 0.6,
  thickness_cm     numeric,
  face_velocity_ms numeric,             -- per-model max face velocity (null → use global setting)
  sheet_face_area_m2 numeric generated always as (round(sheet_l_m * sheet_w_m, 4)) stored,
  brand_id         uuid references public.brands (id) on delete set null,
  active           boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.heater_models (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  thermic_power_kw    numeric,
  air_displacement_m3h numeric,
  coverage_m          numeric,          -- length covered per heater (null → use global setting)
  brand_id            uuid references public.brands (id) on delete set null,
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.air_inlet_models (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  size_label            text,
  airflow_per_inlet_m3h numeric,        -- planning figure per inlet (null → not set)
  brand_id              uuid references public.brands (id) on delete set null,
  active                boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.cage_models (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  section_length_m    numeric not null,
  birds_per_cage      numeric,
  cages_per_section   numeric not null default 2,
  tiers_default       numeric,
  total_cage_area_cm2 numeric,
  brand_id            uuid references public.brands (id) on delete set null,
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- quote_calcs — per-quote house spec + computed results + lighting plan
-- ----------------------------------------------------------------------------
create table if not exists public.quote_calcs (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null unique references public.quotes (id) on delete cascade,
  inputs        jsonb not null default '{}'::jsonb,
  results       jsonb not null default '{}'::jsonb,
  lighting_plan jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Quote lines carry their calc origin + an input snapshot (auditable/reproducible).
alter table public.quote_lines add column if not exists calc_source text;
alter table public.quote_lines add column if not exists calc_meta   jsonb;

-- Indexes
create index if not exists idx_fan_models_type   on public.fan_models (fan_type);
create index if not exists idx_quote_calcs_quote on public.quote_calcs (quote_id);

-- updated_at touch triggers (re-use public.touch_updated_at from 0002)
drop trigger if exists trg_calc_settings_touch on public.calc_settings;
create trigger trg_calc_settings_touch before update on public.calc_settings
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_fan_models_touch on public.fan_models;
create trigger trg_fan_models_touch before update on public.fan_models
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_pad_models_touch on public.cooling_pad_models;
create trigger trg_pad_models_touch before update on public.cooling_pad_models
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_heater_models_touch on public.heater_models;
create trigger trg_heater_models_touch before update on public.heater_models
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_inlet_models_touch on public.air_inlet_models;
create trigger trg_inlet_models_touch before update on public.air_inlet_models
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_cage_models_touch on public.cage_models;
create trigger trg_cage_models_touch before update on public.cage_models
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_quote_calcs_touch on public.quote_calcs;
create trigger trg_quote_calcs_touch before update on public.quote_calcs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: settings + equipment are catalog-style (read all / write admin).
-- quote_calcs inherit the parent quote's visibility.
-- ----------------------------------------------------------------------------
alter table public.calc_settings      enable row level security;
alter table public.fan_models         enable row level security;
alter table public.cooling_pad_models enable row level security;
alter table public.heater_models      enable row level security;
alter table public.air_inlet_models   enable row level security;
alter table public.cage_models        enable row level security;
alter table public.quote_calcs        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['calc_settings','fan_models','cooling_pad_models','heater_models','air_inlet_models','cage_models']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true);', t, t);
    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;

drop policy if exists quote_calcs_all on public.quote_calcs;
create policy quote_calcs_all on public.quote_calcs
  for all to authenticated
  using (exists (select 1 from public.quotes q
                 where q.id = quote_calcs.quote_id and (public.is_admin() or q.owner_user_id = auth.uid())))
  with check (exists (select 1 from public.quotes q
                 where q.id = quote_calcs.quote_id and (public.is_admin() or q.owner_user_id = auth.uid())));

-- ============================================================================
-- SEED — authoritative defaults (Addendum C.13, D, E.1, F)
-- ============================================================================

insert into public.calc_settings (key, value, unit, category, description) values
  -- Feeding / drinking (Addendum C.3, C.4)
  ('feed_lines_11_13',       3,    'lines',   'feeding',  'Feed lines when 11 <= width <= 13 m'),
  ('feed_lines_above_13',    4,    'lines',   'feeding',  'Feed lines when width > 13 m'),
  ('water_lines_11_13',      4,    'lines',   'drinking', 'Water lines when 11 <= width <= 13 m'),
  ('water_lines_above_13',   5,    'lines',   'drinking', 'Water lines when width > 13 m'),
  ('nipples_per_line',       15,   'nipples', 'drinking', 'Nipples per water line (engineer simplification)'),
  -- Tunnel ventilation (C.5)
  ('tunnel_air_speed_ms',    3.0,  'm/s',     'ventilation', 'Tunnel design air speed'),
  ('effective_opening_height_m', 2.0, 'm',    'ventilation', 'Effective tunnel opening height (override per quote)'),
  -- Cooling pad (C.6)
  ('pad_face_velocity_ms',   1.30, 'm/s',     'cooling',  'Pad face velocity (preferred 1.25–1.40, MAX 1.5)'),
  ('pad_height_m',           1.5,  'm',       'cooling',  'Cooling pad height'),
  ('cooling_pad_sides',      2,    'sides',   'cooling',  'Number of walls the pads run on (2 = both sides).'),
  ('pad_area_per_fan_m2',    6,    'm2/fan',  'cooling',  'Fixed pad area required per tunnel fan (rule of thumb; does NOT scale with fan airflow).'),
  ('channel_unit_len_m',     3.0,  'm',       'cooling',  'PVC cooling-pad channel unit length'),
  -- Side ventilation + inlets (C.7, C.8)
  ('bird_requirement_m3h_per_bird', 4.0, 'm3/h/bird', 'ventilation', 'Minimum ventilation per bird (DEFAULT — engineer to confirm by age/weight)'),
  -- Recirculation + heating (C.9, C.10)
  ('recirc_fan_spacing_m',   30,   'm',       'ventilation', 'Spacing between recirculation fans'),
  ('heater_coverage_m',      27.5, 'm',       'heating',  'House length covered per heater (range 25–30)'),
  -- Stocking / bird density (C.13, E.1)
  ('stocking_density_kgm2',  40,   'kg/m2',   'capacity', 'Default stocking density (weight method; editable per quote)'),
  ('birds_per_m2_broiler',   15,   'birds/m2','capacity', 'Floor density — broiler'),
  ('birds_per_m2_breeder',   6,    'birds/m2','capacity', 'Floor density — breeder'),
  ('birds_per_m2_layer_floor', 6,  'birds/m2','capacity', 'Floor density — layer (floor system)'),
  -- Caged systems (Addendum F)
  ('end_clearance_m',        7.0,  'm',       'caged',    'House-end clearance for elevator/egg table (caged)'),
  ('manure_belts_per_tier',  1,    'belts',   'caged',    'Manure belts per tier (caged BOQ multiplier)'),
  ('egg_belts_per_tier',     2,    'belts',   'caged',    'Egg belts per tier (caged BOQ multiplier)'),
  -- Lighting (B.7)
  ('default_target_lux',     60,   'lux',     'lighting', 'Default target lux (HATO plan is authoritative)'),
  ('lamp_spacing_m',         3.0,  'm',       'lighting', 'Estimate-only lamp spacing per row (confirm with HATO)')
on conflict (key) do nothing;

-- Fan models (Addendum D.1–D.3) — capacities at 0 Pa
insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select v.name, v.fan_type::fan_type, v.dia, v.cap, v.hp, b.id, v.notes
from (values
  ('Pericoli EWS 53 / 2',   'TUNNEL', 53, 42900, 2.0,  'Pericoli', 'Exhaust, belt-driven, 50Hz, 0 Pa'),
  ('Pericoli EWS 53 / 1.5', 'TUNNEL', 53, 39300, 1.5,  'Pericoli', 'Exhaust, belt-driven, 50Hz, 0 Pa'),
  ('Pericoli EWS 53 / 1',   'TUNNEL', 53, 32200, 1.0,  'Pericoli', 'Exhaust, belt-driven, 50Hz, 0 Pa'),
  ('Multifan box 140 (G4D14P1 Vplus)', 'TUNNEL', 55, 52700, null, 'Multifan', 'Galv. box fan 140cm, 3ph 50Hz, 0 Pa'),
  ('Multifan box 140 (G4D14A1M11036)', 'TUNNEL', 55, 50300, null, 'Multifan', 'Galv. box fan 140cm, 3ph 50Hz, 0 Pa'),
  ('Multifan box 140 (G4D14A0M11036)', 'TUNNEL', 55, 46200, null, 'Multifan', 'Galv. box fan 140cm, 3ph 50Hz, 0 Pa'),
  ('Pericoli EWD 31 / 0.75', 'SIDE', 31, 15400, 0.75, 'Pericoli', 'Side, direct-driven, 50Hz, 0 Pa'),
  ('Pericoli EWD 37 / 0.75', 'SIDE', 37, 18200, 0.75, 'Pericoli', 'Side, direct-driven, 50Hz, 0 Pa'),
  ('Pericoli EWD 26 / 0.5',  'SIDE', 26, 9600,  0.5,  'Pericoli', 'Side (optional), direct-driven, 0 Pa'),
  ('Pericoli ACF 21',        'CIRCULATION', 21, null, null, 'Pericoli', 'Recirc; sized by spacing (length/recirc_fan_spacing_m). Capacity not in datasheet.')
) as v(name, fan_type, dia, cap, hp, brand_name, notes)
left join public.brands b on b.name = v.brand_name
on conflict (name) do nothing;

-- Cooling pad models (Addendum D.5)
insert into public.cooling_pad_models (name, sheet_l_m, sheet_w_m, thickness_cm, brand_id, notes)
select v.name, 1.5, 0.6, v.thick, b.id, v.notes
from (values
  ('Cooling pad 1.5×0.6×0.10 m', 10, 'UTC.stav', 'Thinner pad; sheet face area 0.90 m²'),
  ('Cooling pad 1.5×0.6×0.15 m', 15, 'UTC.stav', 'Thicker pad (more cooling); sheet face area 0.90 m²')
) as v(name, thick, brand_name, notes)
left join public.brands b on b.name = v.brand_name
on conflict (name) do nothing;

-- Heater models (Addendum D.4)
insert into public.heater_models (name, thermic_power_kw, air_displacement_m3h, coverage_m, brand_id, notes)
select v.name, v.kw, v.air, v.cov, b.id, v.notes
from (values
  ('Pericoli combiTERM E 140', 150, 9500, 27.5, 'Pericoli', 'Indirect air heater; 129,000 kcal/h. Count = length/coverage.'),
  ('UTC.stav heater',          null, null, 27.5, 'UTC.stav', 'Egyptian-made; output/coverage to be entered by client.')
) as v(name, kw, air, cov, brand_name, notes)
left join public.brands b on b.name = v.brand_name
on conflict (name) do nothing;

-- Air inlet models (Addendum D.6) — client working figures
insert into public.air_inlet_models (name, size_label, airflow_per_inlet_m3h, brand_id, notes)
select v.name, v.size, v.cap, b.id, v.notes
from (values
  ('UTC Air Inlet 26×55 cm', '26×55 cm', 1400, 'UTC.stav', 'Client planning figure 1400 (datasheet 1100–1300 by wall thickness). Editable.'),
  ('SKOV DA 1911 flange inlet', 'flange', 1911, 'Skov', 'Client planning figure 1911 (datasheet 1650–2050 @ -10 Pa). Editable.')
) as v(name, size, cap, brand_name, notes)
left join public.brands b on b.name = v.brand_name
on conflict (name) do nothing;

-- Cage models (Addendum F.3)
insert into public.cage_models (name, section_length_m, birds_per_cage, cages_per_section, tiers_default, total_cage_area_cm2, brand_id, notes)
select v.name, v.seclen, v.bpc, v.cps, v.tiers, v.area, b.id, v.notes
from (values
  ('Zucami W (layer)',   0.762, 11,   2, 4, 4801, 'Zucami', '4-tier layer; egg belts 2/tier; manure belt 1/tier'),
  ('Zucami B1610 (broiler cage)', 1.20, null, 2, 3, 7728, 'Zucami', 'Broiler cage; birds_per_cage from broiler offer (client to confirm)')
) as v(name, seclen, bpc, cps, tiers, area, brand_name, notes)
left join public.brands b on b.name = v.brand_name
on conflict (name) do nothing;
