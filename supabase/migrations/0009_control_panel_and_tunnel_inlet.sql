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
