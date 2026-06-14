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
