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
