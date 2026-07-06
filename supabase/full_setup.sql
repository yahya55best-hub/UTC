-- UTC CPQ — full_setup.sql
-- AUTO-CONCATENATED: migrations 0001-0012 + catalog seed, in dependency order.
-- Paste into the Supabase SQL Editor and Run on a FRESH project.


-- ============================================================================
-- >>> 0001_init.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0001 init: extensions, enums, tables, indexes, sequences
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enumerated types
-- ----------------------------------------------------------------------------
create type user_role        as enum ('OWNER', 'ADMIN', 'SALES');
create type brand_type       as enum ('OWN', 'EUROPEAN', 'EGYPTIAN');
create type pricing_mode      as enum ('WAREHOUSE', 'AGENT_COMMISSION', 'FIXED_MONTHLY');
create type buy_currency      as enum ('EUR', 'USD', 'EGP', 'MIXED');
create type currency_code     as enum ('EUR', 'USD', 'EGP');
create type product_category  as enum (
  'FEEDING','DRINKING','SILO','CAGE','CLIMATE_CONTROL','FAN','HEATER',
  'LIGHTING','COOLING_PAD','EGG_TRAY','SPARE_PART','OTHER'
);
create type unit_type         as enum ('PER_METER','PER_UNIT','PER_HOUSE','PER_COMPONENT','PER_SQM');
create type poultry_type      as enum ('BROILER','LAYER','BREEDER','TURKEY','DUCK','ALL');
create type price_value_type  as enum ('UNIT_PRICE','COMMISSION_PERCENT');
create type customer_region   as enum (
  'MIDDLE_EAST','NORTH_AFRICA','EAST_AFRICA','WEST_AFRICA','SOUTHERN_AFRICA','OTHER'
);
create type house_type        as enum ('BROILER','LAYER','BREEDER','HATCHERY','MIXED');
create type quote_status      as enum ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED');

-- ----------------------------------------------------------------------------
-- profiles — 1:1 mirror of auth.users (Addendum A.2)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  role         user_role   not null default 'SALES',
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- app_config — small key/value store (domain allow-list, etc.)
-- ----------------------------------------------------------------------------
create table public.app_config (
  key        text primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- brands
-- ----------------------------------------------------------------------------
create table public.brands (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  origin_country       text,
  brand_type           brand_type    not null,
  pricing_modes        pricing_mode[] not null default '{}',
  default_buy_currency buy_currency  not null default 'EUR',
  notes                text,
  active               boolean       not null default true,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

-- ----------------------------------------------------------------------------
-- products
-- ----------------------------------------------------------------------------
create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid not null references public.brands (id) on delete cascade,
  name                  text not null,
  category              product_category not null,
  unit                  unit_type        not null,
  poultry_types         poultry_type[]   not null default '{ALL}',
  pricing_mode          pricing_mode     not null,
  installation_separate boolean          not null default false,
  active                boolean          not null default true,
  notes                 text,
  created_at            timestamptz      not null default now(),
  updated_at            timestamptz      not null default now()
);

-- ----------------------------------------------------------------------------
-- product_pricing_variants — dual-mode products (4.2.1)
-- ----------------------------------------------------------------------------
create table public.product_pricing_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  pricing_mode pricing_mode not null,
  unit         unit_type    not null,
  label        text         not null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

-- ----------------------------------------------------------------------------
-- price_list_entries — effective-dated prices (4.3)
-- ----------------------------------------------------------------------------
create table public.price_list_entries (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products (id) on delete cascade,
  pricing_variant_id uuid references public.product_pricing_variants (id) on delete cascade,
  currency           currency_code    not null,
  value_type         price_value_type not null default 'UNIT_PRICE',
  amount             numeric(14,2)    not null default 0,
  effective_from     date             not null default current_date,
  effective_to       date,
  created_at         timestamptz      not null default now(),
  updated_at         timestamptz      not null default now()
);

-- ----------------------------------------------------------------------------
-- fx_rates — editable conversion table (Section 5 currency handling)
-- ----------------------------------------------------------------------------
create table public.fx_rates (
  id            uuid primary key default gen_random_uuid(),
  from_currency currency_code not null,
  to_currency   currency_code not null,
  rate          numeric(16,6) not null,
  updated_at    timestamptz   not null default now(),
  unique (from_currency, to_currency),
  check (from_currency <> to_currency)
);

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  company_name       text not null,
  country            text,
  region             customer_region,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  preferred_currency currency_code not null default 'EUR',
  notes              text,
  owner_user_id      uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

-- ----------------------------------------------------------------------------
-- quotes
-- ----------------------------------------------------------------------------
create sequence if not exists public.quote_number_seq start 1;

create table public.quotes (
  id             uuid primary key default gen_random_uuid(),
  quote_number   text unique,                       -- assigned by trigger: UTC-####
  customer_id    uuid not null references public.customers (id),
  project_name   text,
  house_type     house_type,
  currency       currency_code not null default 'EUR',
  status         quote_status  not null default 'DRAFT',
  created_by     uuid references public.profiles (id) default auth.uid(),
  last_edited_by uuid references public.profiles (id),
  owner_user_id  uuid references public.profiles (id) default auth.uid(),
  valid_until    date,
  notes          text,
  subtotal       numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

-- ----------------------------------------------------------------------------
-- quote_lines
-- ----------------------------------------------------------------------------
create table public.quote_lines (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references public.quotes (id) on delete cascade,
  product_id          uuid references public.products (id),
  pricing_variant_id  uuid references public.product_pricing_variants (id),
  brand_snapshot      text,
  description_snapshot text not null,
  unit                unit_type,
  quantity            numeric(14,3) not null default 1,
  unit_price          numeric(14,2) not null default 0,
  -- line_total is always derived from the snapshotted qty x price.
  line_total          numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  -- commission is internal only (agent mode); percent stored, amount derived in views.
  commission_percent  numeric(7,4),
  fx_note             text,          -- e.g. "Converted from EUR @ 52.5"
  is_installation     boolean not null default false,
  sort_order          integer not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes (A.5 #7)
-- ----------------------------------------------------------------------------
create index idx_products_brand            on public.products (brand_id);
create index idx_variants_product          on public.product_pricing_variants (product_id);
create index idx_price_entries_product     on public.price_list_entries (product_id);
create index idx_price_entries_variant     on public.price_list_entries (pricing_variant_id);
create index idx_price_entries_lookup      on public.price_list_entries (product_id, currency, effective_from);
create index idx_customers_owner           on public.customers (owner_user_id);
create index idx_customers_region          on public.customers (region);
create index idx_quotes_owner              on public.quotes (owner_user_id);
create index idx_quotes_status             on public.quotes (status);
create index idx_quotes_customer           on public.quotes (customer_id);
create index idx_quote_lines_quote         on public.quote_lines (quote_id);


-- ============================================================================
-- >>> 0002_functions_triggers.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0002 functions & triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at touch helper
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_touch    before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_brands_touch      before update on public.brands
  for each row execute function public.touch_updated_at();
create trigger trg_products_touch    before update on public.products
  for each row execute function public.touch_updated_at();
create trigger trg_variants_touch    before update on public.product_pricing_variants
  for each row execute function public.touch_updated_at();
create trigger trg_prices_touch      before update on public.price_list_entries
  for each row execute function public.touch_updated_at();
create trigger trg_customers_touch   before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger trg_quotes_touch      before update on public.quotes
  for each row execute function public.touch_updated_at();
create trigger trg_quote_lines_touch before update on public.quote_lines
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Role helpers used inside RLS policies (security definer → read profiles)
-- ----------------------------------------------------------------------------
create or replace function public.auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('OWNER','ADMIN') from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- handle_new_user — auto-create profile on signup, validate company domain,
-- default role SALES. Domain allow-list lives in app_config (key
-- 'allowed_email_domains' → jsonb array of lowercase domains). An empty/absent
-- list means "allow any" (useful for first-run / testing).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain   text;
  v_allowed  jsonb;
begin
  v_domain := lower(split_part(new.email, '@', 2));

  select value into v_allowed
  from public.app_config
  where key = 'allowed_email_domains';

  -- Reject signups from non-approved domains (enforced server-side).
  if v_allowed is not null
     and jsonb_typeof(v_allowed) = 'array'
     and jsonb_array_length(v_allowed) > 0
     and not (v_allowed ? v_domain)
  then
    raise exception 'Signups are restricted to approved company email domains (got: %).', v_domain
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'SALES'                                   -- never self-assign ADMIN/OWNER
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- quote_number — assign UTC-#### sequentially on insert if not provided
-- ----------------------------------------------------------------------------
create or replace function public.assign_quote_number()
returns trigger
language plpgsql
as $$
begin
  if new.quote_number is null or new.quote_number = '' then
    new.quote_number := 'UTC-' || lpad(nextval('public.quote_number_seq')::text, 4, '0');
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.last_edited_by := coalesce(new.last_edited_by, auth.uid());
  return new;
end;
$$;

create trigger trg_quotes_assign_number
  before insert on public.quotes
  for each row execute function public.assign_quote_number();

-- Track last editor automatically on update.
create or replace function public.set_last_edited_by()
returns trigger
language plpgsql
as $$
begin
  new.last_edited_by := coalesce(auth.uid(), new.last_edited_by);
  return new;
end;
$$;

create trigger trg_quotes_last_editor
  before update on public.quotes
  for each row execute function public.set_last_edited_by();

-- ----------------------------------------------------------------------------
-- recompute_quote_totals — keep quotes.subtotal/total in sync with lines
-- (excludes nothing; installation lines are part of the customer total)
-- ----------------------------------------------------------------------------
create or replace function public.recompute_quote_totals(p_quote_id uuid)
returns void
language sql
as $$
  update public.quotes q
  set subtotal = coalesce((
        select sum(line_total) from public.quote_lines
        where quote_id = p_quote_id and is_installation = false), 0),
      total = coalesce((
        select sum(line_total) from public.quote_lines
        where quote_id = p_quote_id), 0)
  where q.id = p_quote_id;
$$;

create or replace function public.trg_quote_lines_recompute()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_quote_totals(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;

create trigger trg_quote_lines_after_change
  after insert or update or delete on public.quote_lines
  for each row execute function public.trg_quote_lines_recompute();


-- ============================================================================
-- >>> 0003_rls.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0003 Row-Level Security (Addendum A.4)
-- RLS is the security boundary, not the frontend. Enable on EVERY table.
-- ============================================================================

alter table public.profiles                 enable row level security;
alter table public.app_config               enable row level security;
alter table public.brands                    enable row level security;
alter table public.products                  enable row level security;
alter table public.product_pricing_variants  enable row level security;
alter table public.price_list_entries        enable row level security;
alter table public.fx_rates                  enable row level security;
alter table public.customers                  enable row level security;
alter table public.quotes                     enable row level security;
alter table public.quote_lines                enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Users may update their own display_name; only admins may change role/active.
-- Enforced by splitting into two policies (a non-admin update that changes
-- role/active will fail the admin policy's check and the self policy can't see
-- the new role value, so it is effectively read-only on those columns at the
-- app layer; we additionally guard with a trigger below).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Hard guard: a non-admin cannot escalate role or flip active, even via the
-- self-update policy.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only guard real, logged-in non-admin users. When auth.uid() is null the
  -- caller is the service role / SQL editor / a superuser doing backend
  -- administration (e.g. bootstrapping the first OWNER) — allow those.
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only OWNER/ADMIN may change a role.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'Only OWNER/ADMIN may change active status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- INSERT into profiles is only ever done by handle_new_user (security definer);
-- no INSERT policy is granted to authenticated users.

-- ----------------------------------------------------------------------------
-- app_config — readable by all signed-in users, writable by admins only
-- ----------------------------------------------------------------------------
create policy app_config_select on public.app_config
  for select to authenticated using (true);
create policy app_config_write on public.app_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Catalog tables — SELECT: any authenticated user; write: admins only
-- ----------------------------------------------------------------------------
create policy brands_select on public.brands
  for select to authenticated using (true);
create policy brands_write on public.brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy products_select on public.products
  for select to authenticated using (true);
create policy products_write on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy variants_select on public.product_pricing_variants
  for select to authenticated using (true);
create policy variants_write on public.product_pricing_variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy prices_select on public.price_list_entries
  for select to authenticated using (true);
create policy prices_write on public.price_list_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy fx_select on public.fx_rates
  for select to authenticated using (true);
create policy fx_write on public.fx_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- customers — SALES see own; ADMIN/OWNER see all
-- ----------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (public.is_admin() or owner_user_id = auth.uid());

create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.is_admin() or owner_user_id = auth.uid());

create policy customers_update on public.customers
  for update to authenticated
  using (public.is_admin() or owner_user_id = auth.uid())
  with check (public.is_admin() or owner_user_id = auth.uid());

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.is_admin() or owner_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- quotes — SALES see own; ADMIN/OWNER see all
-- ----------------------------------------------------------------------------
create policy quotes_select on public.quotes
  for select to authenticated
  using (public.is_admin() or owner_user_id = auth.uid());

create policy quotes_insert on public.quotes
  for insert to authenticated
  with check (public.is_admin() or owner_user_id = auth.uid());

create policy quotes_update on public.quotes
  for update to authenticated
  using (public.is_admin() or owner_user_id = auth.uid())
  with check (public.is_admin() or owner_user_id = auth.uid());

create policy quotes_delete on public.quotes
  for delete to authenticated
  using (public.is_admin() or owner_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- quote_lines — inherit visibility from the parent quote
-- ----------------------------------------------------------------------------
create policy quote_lines_all on public.quote_lines
  for all to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and (public.is_admin() or q.owner_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_lines.quote_id
        and (public.is_admin() or q.owner_user_id = auth.uid())
    )
  );


-- ============================================================================
-- >>> 0004_admin_views.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0004 admin overview views (Addendum A.7)
-- Views run with the owner's rights (definer), so they read across all rows;
-- each is guarded by `public.is_admin()` so SALES users get zero rows.
-- ============================================================================

-- Pipeline by status (counts + value per currency per status).
create or replace view public.v_admin_quote_pipeline as
select
  q.status,
  q.currency,
  count(*)                       as quote_count,
  coalesce(sum(q.total), 0)      as total_value
from public.quotes q
where public.is_admin()
group by q.status, q.currency;

-- Total quoted value grouped by currency (do NOT blindly sum across currencies).
create or replace view public.v_admin_value_by_currency as
select
  q.currency,
  count(*)                                                          as quote_count,
  coalesce(sum(q.total), 0)                                         as total_quoted,
  coalesce(sum(q.total) filter (where q.status = 'ACCEPTED'), 0)    as total_accepted,
  coalesce(sum(q.total) filter (
    where q.created_at >= date_trunc('month', now())), 0)          as total_this_month
from public.quotes q
where public.is_admin()
group by q.currency;

-- Per-user activity (quotes created, this month / all time, active customers).
create or replace view public.v_admin_user_activity as
select
  p.id                                   as user_id,
  p.display_name,
  p.email,
  p.role,
  count(distinct q.id)                                                       as quotes_total,
  count(distinct q.id) filter (where q.created_at >= date_trunc('month', now())) as quotes_this_month,
  count(distinct c.id)                                                       as customers_total
from public.profiles p
left join public.quotes    q on q.owner_user_id = p.id
left join public.customers c on c.owner_user_id = p.id
where public.is_admin()
group by p.id, p.display_name, p.email, p.role;

-- Recent activity feed across all users.
create or replace view public.v_admin_recent_activity as
select
  q.id,
  q.quote_number,
  q.project_name,
  q.status,
  q.currency,
  q.total,
  q.created_at,
  q.updated_at,
  cust.company_name as customer_name,
  owner.display_name as owner_name
from public.quotes q
join public.customers cust on cust.id = q.customer_id
left join public.profiles owner on owner.id = q.owner_user_id
where public.is_admin()
order by q.updated_at desc;

-- Top customers by quoted value (per currency).
create or replace view public.v_admin_top_customers as
select
  c.id,
  c.company_name,
  c.country,
  q.currency,
  count(q.id)                as quote_count,
  coalesce(sum(q.total), 0)  as total_value
from public.customers c
join public.quotes q on q.customer_id = c.id
where public.is_admin()
group by c.id, c.company_name, c.country, q.currency;

-- Internal commission estimate from agent-mode lines (ADMIN-only; never on PDF).
create or replace view public.v_admin_commission as
select
  q.id            as quote_id,
  q.quote_number,
  q.currency,
  cust.company_name as customer_name,
  coalesce(sum(
    case when ql.commission_percent is not null
         then round(ql.line_total * ql.commission_percent / 100.0, 2)
         else 0 end
  ), 0)           as commission_amount
from public.quotes q
join public.customers cust on cust.id = q.customer_id
join public.quote_lines ql on ql.quote_id = q.id
where public.is_admin()
  and ql.commission_percent is not null
group by q.id, q.quote_number, q.currency, cust.company_name;

grant select on
  public.v_admin_quote_pipeline,
  public.v_admin_value_by_currency,
  public.v_admin_user_activity,
  public.v_admin_recent_activity,
  public.v_admin_top_customers,
  public.v_admin_commission
to authenticated;


-- ============================================================================
-- >>> 0005_constraints.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0005 unique constraints (support idempotent seeding & data hygiene)
-- ============================================================================

alter table public.brands
  add constraint brands_name_key unique (name);

alter table public.products
  add constraint products_brand_name_key unique (brand_id, name);

alter table public.product_pricing_variants
  add constraint variants_product_label_key unique (product_id, label);

-- Demo customers are seeded by company name; this also prevents accidental dupes.
alter table public.customers
  add constraint customers_company_name_key unique (company_name);


-- ============================================================================
-- >>> seed.sql
-- ============================================================================
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


-- ============================================================================
-- >>> 0006_calc_engine.sql
-- ============================================================================
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
  ('air_inlet_spacing_m',    3,    'm',       'ventilation', 'House length per air inlet window (floor(L/spacing) = total for the house).'),
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


-- ============================================================================
-- >>> 0007_signup_approval.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0007 signup approval
-- New self-signups are created INACTIVE (active = false) and must be approved
-- by an OWNER/ADMIN before they can use the app. Safe to paste into the SQL
-- editor on the existing project (replaces the handle_new_user function).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain   text;
  v_allowed  jsonb;
begin
  v_domain := lower(split_part(new.email, '@', 2));

  select value into v_allowed
  from public.app_config
  where key = 'allowed_email_domains';

  if v_allowed is not null
     and jsonb_typeof(v_allowed) = 'array'
     and jsonb_array_length(v_allowed) > 0
     and not (v_allowed ? v_domain)
  then
    raise exception 'Signups are restricted to approved company email domains (got: %).', v_domain
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'SALES',
    false                       -- pending: an OWNER/ADMIN must approve (activate)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ============================================================================
-- >>> 0008_pipe_settings_and_new_products.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0008 pipe-calc settings + Silo/Flex-auger and External loader
-- Adds the pipe-length constants (editable) and two new catalogue products with
-- real VAT-inclusive EGP prices. Idempotent; safe to paste into the SQL editor.
-- ============================================================================

-- Pipe-calculation constants (the engine also has code fallbacks for these).
insert into public.calc_settings (key, value, unit, category, description) values
  ('pipe_clearance_total_m', 3,    'm',       'feeding',  'Length removed for front+back clearance (1.5 m each end)'),
  ('feed_pipe_len_m',        3.05, 'm',       'feeding',  'Feeding pipe length (ROXELL galvanised)'),
  ('water_pipe_len_m',       3,    'm',       'drinking', 'Drinking PVC pipe length'),
  ('nipples_per_pipe',       15,   'nipples', 'drinking', 'Nipples per drinking pipe (≈20 cm spacing)')
on conflict (key) do nothing;

-- ---- Silo + Flex Auger (ROXELL) — bundled, priced by capacity --------------
insert into public.products (brand_id, name, category, unit, poultry_types, pricing_mode, notes)
select b.id, 'Silo + Flex Auger (ROXELL)', 'SILO', 'PER_UNIT', '{ALL}', 'WAREHOUSE',
       'Bundled silo + ROXELL flex auger; price by capacity option. VAT-inclusive (14%).'
from public.brands b where b.name = 'Roxell'
on conflict (brand_id, name) do nothing;

insert into public.product_pricing_variants (product_id, pricing_mode, unit, label)
select p.id, 'WAREHOUSE', 'PER_UNIT', v.label
from public.products p
join public.brands b on b.id = p.brand_id
cross join (values ('Silo 16.5 ton + flex auger'), ('Silo 9.4 ton + flex auger')) as v(label)
where b.name = 'Roxell' and p.name = 'Silo + Flex Auger (ROXELL)'
on conflict (product_id, label) do nothing;

insert into public.price_list_entries (product_id, pricing_variant_id, currency, value_type, amount)
select v.product_id, v.id, 'EGP', 'UNIT_PRICE',
       case when v.label like '%16.5%' then 255000 else 190000 end
from public.product_pricing_variants v
join public.products p on p.id = v.product_id
join public.brands b on b.id = p.brand_id
where b.name = 'Roxell' and p.name = 'Silo + Flex Auger (ROXELL)'
  and not exists (
    select 1 from public.price_list_entries e
    where e.pricing_variant_id = v.id and e.currency = 'EGP'
      and e.value_type = 'UNIT_PRICE' and e.amount <> 0);

-- ---- External loader (Mallow) — locally made ------------------------------
insert into public.products (brand_id, name, category, unit, poultry_types, pricing_mode, notes)
select b.id, 'External loader (Mallow)', 'OTHER', 'PER_UNIT', '{ALL}', 'WAREHOUSE',
       'Locally made from 6-inch iron pipes; excludes loading hopper. VAT-inclusive (14%).'
from public.brands b where b.name = 'UTC.stav'
on conflict (brand_id, name) do nothing;

insert into public.price_list_entries (product_id, currency, value_type, amount)
select p.id, 'EGP', 'UNIT_PRICE', 60000
from public.products p
join public.brands b on b.id = p.brand_id
where b.name = 'UTC.stav' and p.name = 'External loader (Mallow)'
  and not exists (
    select 1 from public.price_list_entries e
    where e.product_id = p.id and e.pricing_variant_id is null
      and e.currency = 'EGP' and e.value_type = 'UNIT_PRICE' and e.amount <> 0);


-- ============================================================================
-- >>> 0009_control_panel_and_tunnel_inlet.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0009 SKOV control panel + tunnel inlet catalogue products
-- Prices left at 0.00 (to be entered by Admin). Idempotent.
-- ============================================================================

insert into public.products (brand_id, name, category, unit, poultry_types, pricing_mode, notes)
select b.id, 'Control panel (SKOV DOL 534)', 'CLIMATE_CONTROL', 'PER_UNIT', '{ALL}', 'WAREHOUSE',
       'SKOV DOL 534 climate controller system. Price to be entered.'
from public.brands b where b.name = 'Skov'
on conflict (brand_id, name) do nothing;

insert into public.products (brand_id, name, category, unit, poultry_types, pricing_mode, notes)
select b.id, 'Tunnel inlet system', 'CLIMATE_CONTROL', 'PER_UNIT', '{ALL}', 'WAREHOUSE',
       'Tunnel inlet on cooling-pad openings; 27 m x 1 m per side, motor-controlled. Price to be entered.'
from public.brands b where b.name = 'UTC.stav'
on conflict (brand_id, name) do nothing;

insert into public.price_list_entries (product_id, currency, value_type, amount)
select p.id, 'EGP', 'UNIT_PRICE', 0
from public.products p
where p.name in ('Control panel (SKOV DOL 534)', 'Tunnel inlet system')
  and not exists (
    select 1 from public.price_list_entries e
    where e.product_id = p.id and e.pricing_variant_id is null
      and e.currency = 'EGP' and e.value_type = 'UNIT_PRICE');


-- ============================================================================
-- >>> 0010_air_inlet_area_sizing.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0010 air-inlet area-based sizing
-- Adds structured width_m/height_m columns to air_inlet_models, the three inlet
-- settings, seeds confirmed inlet dimensions, and adds the Pericoli EWS 42 side
-- fan (18000 m³/h). Idempotent; safe to paste into the SQL editor.
-- ============================================================================

alter table public.air_inlet_models add column if not exists width_m  numeric;
alter table public.air_inlet_models add column if not exists height_m numeric;

comment on column public.air_inlet_models.airflow_per_inlet_m3h is
  'Informational only — NOT used by the inlet-count calculation (that uses width_m × height_m).';

-- Confirmed effective-opening dimensions (datasheets).
update public.air_inlet_models set width_m = 0.55,   height_m = 0.26   where name = 'UTC Air Inlet 26×55 cm';
update public.air_inlet_models set width_m = 0.8148, height_m = 0.2578 where name = 'SKOV DA 1911 flange inlet';

-- Inlet sizing constants (admin-editable). Inlets size on FULL tunnel capacity
-- at inlet velocity; side vent is a separate air-changes-per-hour path.
insert into public.calc_settings (key, value, unit, category, description) values
  ('inlet_air_velocity_ms',  5,  'm/s',  'ventilation', 'Design inlet air velocity (inlet-area sizing on tunnel capacity)'),
  ('air_inlet_spacing_m',    3,  'm',    'ventilation', 'Inlet placement spacing (center-to-center) + physical max per side'),
  ('side_vent_ach',          14, 'ACH',  'ventilation', 'Air changes per hour for side/transitional (minimum) ventilation')
on conflict (key) do nothing;

-- Pericoli EWS 42 side fan (matches the product description; 18000 m³/h).
insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Pericoli EWS 42', 'SIDE', 42, 18000, 1.0, b.id, 'Side/winter exhaust fan, 115×115 cm, 1 HP.'
from public.brands b where b.name = 'Pericoli'
on conflict (name) do nothing;


-- ============================================================================
-- >>> 0011_vent_corrections.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0011 ventilation corrections
-- (For databases that already applied 0010 with the earlier values.)
--   A) Air inlets now size on FULL tunnel capacity at 5 m/s.
--   B) Side fans now use air-changes-per-hour (min/transitional ventilation).
-- Idempotent; safe to paste into the SQL editor.
-- ============================================================================

-- A) inlet velocity 3 -> 5, drop the unused side-fan sizing constant
update public.calc_settings set value = 5 where key = 'inlet_air_velocity_ms';
delete from public.calc_settings where key = 'inlet_sizing_side_fans';

-- B) side ventilation air-changes-per-hour
insert into public.calc_settings (key, value, unit, category, description) values
  ('side_vent_ach', 14, 'ACH', 'ventilation', 'Air changes per hour for side/transitional (minimum) ventilation')
on conflict (key) do nothing;


-- ============================================================================
-- >>> 0012_master_spec.sql
-- ============================================================================
-- ============================================================================
-- UTC CPQ — 0012 master calculation spec alignment
-- Tunnel fans sized on cross-section × target airspeed; new pipe/clearance
-- setting names; the EWS 53 (36000) and Multifan box 130 (44600) tunnel models.
-- Idempotent; safe to paste into the SQL editor.
-- ============================================================================

insert into public.calc_settings (key, value, unit, category, description) values
  ('tunnel_target_airspeed_ms', 2.6, 'm/s', 'ventilation', 'Tunnel design air speed (cross-section × airspeed fan sizing)'),
  ('house_end_clearance_m',     3,   'm',   'feeding',     'Length removed for front+back clearance (1.5 m each end)'),
  ('drink_pipe_len_m',          3,   'm',   'drinking',    'Drinking PVC pipe length')
on conflict (key) do nothing;

-- Tunnel fan models (working capacities used by the sizing engine).
insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Pericoli EWS 53', 'TUNNEL', 53, 36000, 1.5, b.id, 'Tunnel exhaust fan, working capacity 36000 m³/h.'
from public.brands b where b.name = 'Pericoli'
on conflict (name) do nothing;

insert into public.fan_models (name, fan_type, diameter_in, capacity_m3h, power_hp, brand_id, notes)
select 'Multifan box 130', 'TUNNEL', 51, 44600, null, b.id, 'Galvanised box fan 130 cm, 44600 m³/h.'
from public.brands b where b.name = 'Multifan'
on conflict (name) do nothing;


