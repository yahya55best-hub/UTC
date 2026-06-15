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
