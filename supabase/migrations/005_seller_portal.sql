-- Seller portal: apply -> admin approves -> shop is created and the user gets the "My Shop" tab.
-- Run after 004.

create type public.application_status as enum ('pending','approved','rejected');

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_name text not null check (char_length(shop_name) between 2 and 80),
  description text,
  phone text not null,
  region text not null,
  city text not null,
  address_text text,
  status public.application_status not null default 'pending',
  reject_reason text,
  shop_id uuid references public.shops(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);
-- one open application per person
create unique index seller_applications_one_pending on public.seller_applications (user_id) where status = 'pending';
create index on public.seller_applications (status, created_at);

alter table public.seller_applications enable row level security;
create policy sellerapp_select on public.seller_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- no insert/update policies: everything goes through the functions below

-- Monthly sales goal the owner sets from My Shop (drives the progress bar)
alter table public.shops add column if not exists monthly_goal numeric(12,2) check (monthly_goal is null or monthly_goal >= 0);

-- Buyer applies ---------------------------------------------------------------
create function public.apply_as_seller(p_shop_name text, p_description text, p_phone text,
                                       p_region text, p_city text, p_address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.shops where owner_id = auth.uid()) then raise exception 'already_has_shop'; end if;
  if exists (select 1 from public.seller_applications where user_id = auth.uid() and status = 'pending') then
    raise exception 'application_pending'; end if;
  if coalesce(trim(p_shop_name),'') = '' or coalesce(trim(p_phone),'') = ''
     or coalesce(trim(p_region),'') = '' or coalesce(trim(p_city),'') = '' then
    raise exception 'missing_details'; end if;
  insert into public.seller_applications (user_id, shop_name, description, phone, region, city, address_text)
  values (auth.uid(), trim(p_shop_name), nullif(trim(p_description),''), trim(p_phone), trim(p_region), trim(p_city), nullif(trim(p_address),''))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.apply_as_seller(text,text,text,text,text,text) from public, anon;
grant execute on function public.apply_as_seller(text,text,text,text,text,text) to authenticated;

-- Admin approves / rejects -----------------------------------------------------
create function public.approve_seller_application(p_id uuid, p_commission numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.seller_applications; v_slug text; v_base text; v_n int := 1; v_shop uuid; v_comm numeric;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into a from public.seller_applications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if exists (select 1 from public.shops where owner_id = a.user_id) then raise exception 'already_has_shop'; end if;

  v_base := trim(both '-' from regexp_replace(lower(a.shop_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'shop'; end if;
  v_slug := v_base;
  while exists (select 1 from public.shops where slug = v_slug) loop
    v_n := v_n + 1; v_slug := v_base || '-' || v_n;
  end loop;

  v_comm := coalesce(p_commission, public.setting_num('default_commission_pct'), 10);
  insert into public.shops (owner_id, name, slug, description, phone, address_text, region, city, status, commission_pct)
  values (a.user_id, a.shop_name, v_slug, a.description, a.phone, a.address_text, a.region, a.city, 'active', v_comm)
  returning id into v_shop;

  update public.profiles set role = 'seller' where id = a.user_id and role = 'buyer';
  update public.seller_applications
     set status = 'approved', shop_id = v_shop, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;

  insert into public.notification_outbox (user_id, kind, payload, channels)
  values (a.user_id, 'seller_approved', jsonb_build_object('shop_name', a.shop_name), '{push,email}');
  return v_shop;
end $$;

create function public.reject_seller_application(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.seller_applications;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into a from public.seller_applications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if a.status <> 'pending' then raise exception 'already_reviewed'; end if;
  update public.seller_applications
     set status = 'rejected', reject_reason = nullif(trim(p_reason),''), reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
  insert into public.notification_outbox (user_id, kind, payload, channels)
  values (a.user_id, 'seller_rejected', jsonb_build_object('shop_name', a.shop_name, 'reason', nullif(trim(p_reason),'')), '{push,email}');
end $$;
revoke execute on function public.approve_seller_application(uuid,numeric) from public, anon;
revoke execute on function public.reject_seller_application(uuid,text) from public, anon;
grant execute on function public.approve_seller_application(uuid,numeric) to authenticated;
grant execute on function public.reject_seller_application(uuid,text) to authenticated;

-- A suspended shop must not be able to keep listing: sellers can still edit the profile,
-- but new products stay hidden by products_select (shop must be active) - nothing more needed.

-- Tell the shop owner when a new paid package arrives --------------------------
create or replace function public.notify_seller_new_package() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select owner_id into v_owner from public.shops where id = new.shop_id;
    if v_owner is not null then
      insert into public.notification_outbox (user_id, kind, payload, channels)
      values (v_owner, 'seller_new_order', jsonb_build_object(
        'package_id', new.id, 'order_number', new.order_number, 'amount', new.subtotal), '{push}');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_seller_new_package on public.packages;
create trigger trg_notify_seller_new_package after insert or update on public.packages
  for each row execute function public.notify_seller_new_package();

-- Progress numbers for the My Shop screen ------------------------------------
-- p_days: 7 / 30 / 90. Sales = packages that were paid and not cancelled/returned/refunded.
create function public.seller_stats(p_shop uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days,30),1),365); v_from timestamptz; r jsonb;
begin
  if not (public.owns_shop(p_shop) or public.is_admin()) then raise exception 'forbidden'; end if;
  v_from := (date_trunc('day', now() at time zone 'Africa/Accra') - make_interval(days => v_days - 1)) at time zone 'Africa/Accra';

  with good as (
    select pk.* from public.packages pk
     where pk.shop_id = p_shop
       and pk.status in ('paid','processing','ready','assigned','dispatched','in_transit','awaiting_pickup','delivered','completed')
  ), days as (
    select d::date as day from generate_series(
      (v_from at time zone 'Africa/Accra')::date, (now() at time zone 'Africa/Accra')::date, interval '1 day') d
  ), per_day as (
    select (g.created_at at time zone 'Africa/Accra')::date as day, sum(g.subtotal) as sales, count(*) as orders
      from good g where g.created_at >= v_from group by 1
  )
  select jsonb_build_object(
    'days', v_days,
    'sales',    coalesce((select sum(subtotal) from good where created_at >= v_from), 0),
    'earnings', coalesce((select sum(shop_earnings) from good where created_at >= v_from), 0),
    'orders',   (select count(*) from good where created_at >= v_from),
    'units',    coalesce((select sum(oi.quantity) from public.order_items oi join good g on g.id = oi.package_id where g.created_at >= v_from), 0),
    'prev_sales', coalesce((select sum(subtotal) from good
                             where created_at >= v_from - make_interval(days => v_days) and created_at < v_from), 0),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(d.day,'YYYY-MM-DD'),
                         'sales', coalesce(p.sales,0), 'orders', coalesce(p.orders,0)) order by d.day)
                         from days d left join per_day p using (day)), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(t) from (
         select oi.title, sum(oi.quantity)::int as units, sum(oi.line_total) as revenue
           from public.order_items oi join good g on g.id = oi.package_id
          where g.created_at >= v_from group by oi.title order by sum(oi.line_total) desc limit 5) t), '[]'::jsonb),
    'to_do', jsonb_build_object(
        'to_pack',   (select count(*) from public.packages where shop_id = p_shop and status in ('paid','processing')),
        'ready',     (select count(*) from public.packages where shop_id = p_shop and status in ('ready','assigned')),
        'open_returns', (select count(*) from public.return_requests where shop_id = p_shop and status = 'requested'),
        'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                       where p.shop_id = p_shop and p.status = 'active' and v.is_active and v.stock_qty <= 3)),
    'products', jsonb_build_object(
        'active', (select count(*) from public.products where shop_id = p_shop and status = 'active'),
        'draft',  (select count(*) from public.products where shop_id = p_shop and status = 'draft')),
    'balance', jsonb_build_object(
        'pending',   coalesce((select sum(amount) from public.ledger_entries where shop_id = p_shop and status = 'pending'), 0),
        'available', coalesce((select sum(amount) from public.ledger_entries
                                where shop_id = p_shop and (status = 'available' or entry_type = 'payout')), 0),
        'paid_out',  coalesce((select -sum(amount) from public.ledger_entries where shop_id = p_shop and entry_type = 'payout'), 0))
  ) into r;
  return r;
end $$;
revoke execute on function public.seller_stats(uuid,int) from public, anon;
grant execute on function public.seller_stats(uuid,int) to authenticated;
