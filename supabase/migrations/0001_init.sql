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
