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
