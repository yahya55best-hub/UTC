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
