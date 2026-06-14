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
