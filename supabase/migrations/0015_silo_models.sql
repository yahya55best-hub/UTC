-- ============================================================================
-- UTC CPQ — 0015 Roxell silo models for feed-storage sizing
-- Structured silo capacities (tons) + prices so the engine can size silos from
-- birds × daily feed × days of storage. Flex auger is bundled in each model
-- (it is the silo→feed-line connection). Idempotent; paste into the SQL editor.
-- ============================================================================

create table if not exists public.silo_models (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  capacity_tons numeric not null,
  price_egp     numeric,
  brand_id      uuid references public.brands (id) on delete set null,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_silo_models_touch on public.silo_models;
create trigger trg_silo_models_touch before update on public.silo_models
  for each row execute function public.touch_updated_at();

alter table public.silo_models enable row level security;
drop policy if exists silo_models_select on public.silo_models;
create policy silo_models_select on public.silo_models for select to authenticated using (true);
drop policy if exists silo_models_write on public.silo_models;
create policy silo_models_write on public.silo_models for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Daily feed consumption used for silo sizing (admin-editable).
insert into public.calc_settings (key, value, unit, category, description) values
  ('daily_feed_kg_per_bird', 0.17, 'kg/bird/day', 'feeding', 'Daily feed per bird, for silo storage sizing')
on conflict (key) do nothing;

-- Roxell silo models (flex auger bundled; prices VAT-inclusive EGP).
insert into public.silo_models (name, capacity_tons, price_egp, brand_id, notes)
select v.name, v.tons, v.price, b.id, 'ROXELL silo + flex auger bundle (auger is the silo→feed-line connection).'
from (values
  ('Roxell silo 16.5 t + flex auger', 16.5, 255000),
  ('Roxell silo 9.4 t + flex auger',  9.4,  190000)
) as v(name, tons, price)
left join public.brands b on b.name = 'Roxell'
on conflict (name) do nothing;
