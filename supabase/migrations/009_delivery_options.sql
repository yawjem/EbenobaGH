-- Delivery methods + delivery speeds + international zones, all affecting the delivery fee. Run after 008.
--
-- The buyer picks ONE method and ONE speed for the whole order.
--   Ghana address        -> Ebenoba Rider, Shaq Express, Seamless Courier Service
--   Other country        -> FedEx (only if the country is in an active zone)
-- Fee per package:
--   Ghana:          (delivery_rates fee) x (method factor) x (speed multiplier)
--   International:  (zone base + zone per-kg x weight kg) x (method factor) x (speed multiplier)
-- Everything below is editable by an admin (Delivery page in the dashboard). Seed numbers are placeholders.

create table public.delivery_methods (
  code text primary key,
  label text not null,
  kind text not null check (kind in ('local', 'international')),
  carrier public.delivery_method not null,          -- 'rider' keeps the delivery-code (PIN) flow
  factor numeric(6,3) not null default 1 check (factor > 0),
  is_active boolean not null default true,
  sort int not null default 0
);
create table public.delivery_speeds (
  code text primary key,
  label text not null,
  min_days int not null check (min_days >= 0),
  max_days int not null check (max_days >= min_days),
  multiplier numeric(6,3) not null default 1 check (multiplier > 0),
  same_region_only boolean not null default false,  -- same-day only when the shop and the buyer are in the same region
  is_active boolean not null default true,
  sort int not null default 0
);
create table public.delivery_method_speeds (
  method_code text not null references public.delivery_methods(code) on delete cascade,
  speed_code  text not null references public.delivery_speeds(code) on delete cascade,
  primary key (method_code, speed_code)
);
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_codes text[] not null default '{}',       -- two-letter codes, e.g. {NG,TG,BJ}
  base_fee numeric(10,2) not null check (base_fee >= 0),
  per_kg_fee numeric(10,2) not null default 0 check (per_kg_fee >= 0),
  is_active boolean not null default true
);

alter table public.delivery_methods enable row level security;
alter table public.delivery_speeds enable row level security;
alter table public.delivery_method_speeds enable row level security;
alter table public.delivery_zones enable row level security;
do $$ declare t text; begin
  foreach t in array array['delivery_methods','delivery_speeds','delivery_method_speeds','delivery_zones'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

insert into public.delivery_methods (code, label, kind, carrier, factor, sort) values
  ('ebenoba_rider', 'Ebenoba Rider',            'local',         'rider',   1.000, 1),
  ('shaq_express',  'Shaq Express',             'local',         'courier', 1.150, 2),
  ('seamless',      'Seamless Courier Service', 'local',         'courier', 1.000, 3),
  ('fedex',         'FedEx International',      'international', 'courier', 1.000, 4);
insert into public.delivery_speeds (code, label, min_days, max_days, multiplier, same_region_only, sort) values
  ('same_day',   'Same day',  0,  0, 1.800, true,  1),
  ('three_days', '3 days',    1,  3, 1.000, false, 2),
  ('one_week',   '1 week',    4,  7, 0.800, false, 3),
  ('two_weeks',  '2 weeks',   8, 14, 0.650, false, 4);
insert into public.delivery_method_speeds (method_code, speed_code) values
  ('ebenoba_rider','same_day'), ('ebenoba_rider','three_days'), ('ebenoba_rider','one_week'),
  ('shaq_express','same_day'),  ('shaq_express','three_days'),  ('shaq_express','one_week'), ('shaq_express','two_weeks'),
  ('seamless','three_days'),    ('seamless','one_week'),        ('seamless','two_weeks'),
  ('fedex','three_days'),       ('fedex','one_week'),           ('fedex','two_weeks');
-- PLACEHOLDER zones and prices (GHS). Check the real FedEx country list and your quotes, then edit in the admin dashboard.
insert into public.delivery_zones (name, country_codes, base_fee, per_kg_fee) values
  ('West Africa',      '{NG,TG,BJ,CI,BF,SN,GM,SL,LR}',                  250, 60),
  ('Rest of Africa',   '{ZA,KE,EG,MA,TZ,UG,RW,ET,CM}',                  400, 90),
  ('Europe',           '{GB,DE,FR,NL,IT,ES,BE,IE,SE,CH}',               650, 130),
  ('North America',    '{US,CA}',                                        700, 140),
  ('Middle East & Asia','{AE,SA,IN,CN,JP,SG,MY,TR}',                    750, 150);

-- Where the order is going -----------------------------------------------------
alter table public.addresses add column country_code text not null default 'GH' check (country_code ~ '^[A-Z]{2}$');
alter table public.orders   add column delivery_method_code text references public.delivery_methods(code),
                            add column delivery_speed_code  text references public.delivery_speeds(code);
alter table public.packages add column delivery_method_code text references public.delivery_methods(code),
                            add column delivery_speed_code  text references public.delivery_speeds(code);

-- Sellers must not be able to change what the buyer chose
create function public.guard_package_delivery_choice() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.delivery_method_code is distinct from old.delivery_method_code
          or new.delivery_speed_code is distinct from old.delivery_speed_code) then
    raise exception 'Delivery choice is read-only';
  end if;
  return new;
end $$;
create trigger trg_guard_package_delivery_choice before update on public.packages
  for each row execute function public.guard_package_delivery_choice();

-- Weight and region of what each shop contributes to a cart ---------------------
create function public._cart_shop_lines(p_items jsonb)
returns table (shop_id uuid, region text, weight_kg numeric)
language sql stable security definer set search_path = public as $$
  select p.shop_id, s.region, sum(coalesce(p.weight_kg, 0.5) * i.qty)
    from (select (x ->> 'variant_id')::uuid as vid, sum((x ->> 'qty')::int) as qty
            from jsonb_array_elements(p_items) x group by 1) i
    join public.product_variants v on v.id = i.vid
    join public.products p on p.id = v.product_id
    join public.shops s on s.id = p.shop_id
   group by p.shop_id, s.region
$$;
revoke execute on function public._cart_shop_lines(jsonb) from public, anon, authenticated;

-- Fee + delivery days for ONE package. Returns no row when that method/speed can't serve it.
create function public._package_fee(p_method text, p_speed text, p_shop_region text,
                                    p_addr public.addresses, p_weight numeric)
returns table (fee numeric, min_days int, max_days int)
language plpgsql stable security definer set search_path = public as $$
declare m public.delivery_methods; s public.delivery_speeds; r record; z public.delivery_zones; v numeric;
begin
  select * into m from public.delivery_methods where code = p_method and is_active;
  select * into s from public.delivery_speeds  where code = p_speed  and is_active;
  if m.code is null or s.code is null then return; end if;
  if not exists (select 1 from public.delivery_method_speeds where method_code = p_method and speed_code = p_speed) then return; end if;

  if m.kind = 'local' then
    if p_addr.country_code <> 'GH' then return; end if;
    if s.same_region_only and p_shop_region is distinct from p_addr.region then return; end if;
    select dr.fee as f into r from public.delivery_rates dr
     where dr.from_region in (coalesce(p_shop_region, 'ANY'), 'ANY') and dr.to_region in (p_addr.region, 'ANY')
     order by (dr.from_region = 'ANY')::int + (dr.to_region = 'ANY')::int limit 1;
    if not found then return; end if;
    v := r.f;
  else
    if p_addr.country_code = 'GH' then return; end if;
    select * into z from public.delivery_zones where is_active and p_addr.country_code = any (country_codes) limit 1;
    if z.id is null then return; end if;
    v := z.base_fee + z.per_kg_fee * ceil(greatest(coalesce(p_weight, 0), 0.5));
  end if;
  return query select round(v * m.factor * s.multiplier, 2), s.min_days, s.max_days;
end $$;
revoke execute on function public._package_fee(text,text,text,public.addresses,numeric) from public, anon, authenticated;

-- The app calls this to show the options and their prices before paying ----------
create function public.delivery_quote(p_address uuid, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.addresses; out jsonb := '[]'; m record; s record; l record; f record;
        total numeric; dmin int; dmax int; ok boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into a from public.addresses where id = p_address and user_id = auth.uid();
  if not found then raise exception 'address_not_found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;

  for m in select * from public.delivery_methods where is_active order by sort loop
    for s in select ds.* from public.delivery_speeds ds join public.delivery_method_speeds ms on ms.speed_code = ds.code
              where ms.method_code = m.code and ds.is_active order by ds.sort loop
      total := 0; dmin := 0; dmax := 0; ok := true;
      for l in select * from public._cart_shop_lines(p_items) loop
        select * into f from public._package_fee(m.code, s.code, l.region, a, l.weight_kg);
        if not found then ok := false; exit; end if;
        total := total + f.fee; dmin := greatest(dmin, f.min_days); dmax := greatest(dmax, f.max_days);
      end loop;
      if ok then
        out := out || jsonb_build_object('method', m.code, 'method_label', m.label, 'kind', m.kind,
          'speed', s.code, 'speed_label', s.label, 'fee', total, 'min_days', dmin, 'max_days', dmax);
      end if;
    end loop;
  end loop;
  return out;
end $$;
revoke execute on function public.delivery_quote(uuid, jsonb) from public, anon;
grant execute on function public.delivery_quote(uuid, jsonb) to authenticated;

-- Countries the buyer may pick for an international address
create function public.delivery_countries() returns text[] language sql stable as $$
  select coalesce(array_agg(distinct c order by c), '{}')
    from public.delivery_zones z, unnest(z.country_codes) c
   where z.is_active and exists (select 1 from public.delivery_methods where kind = 'international' and is_active)
$$;
grant execute on function public.delivery_countries() to anon, authenticated;

-- create_order: now takes the delivery method + speed ----------------------------
drop function public.create_order(uuid, uuid, jsonb);
create function public.create_order(p_buyer uuid, p_address uuid, p_items jsonb,
                                    p_method text default null, p_speed text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_addr   public.addresses%rowtype;
  v_ship   jsonb;
  v_order  uuid;
  v_number text;
  v_ref    text;
  v_chk    record;
  v_shop   record;
  v_fee    record;
  v_meth   public.delivery_methods;
  v_pkg    uuid;
  v_idx    smallint := 0;
  v_sd     numeric(12,2);
  v_pd     numeric(12,2);
  v_total  numeric(12,2);
begin
  if p_buyer is null then raise exception 'not_authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'cart_too_large'; end if;
  if coalesce(p_method, '') = '' or coalesce(p_speed, '') = '' then raise exception 'delivery_required'; end if;

  select * into v_addr from public.addresses where id = p_address and user_id = p_buyer;
  if not found then raise exception 'address_not_found'; end if;
  select * into v_meth from public.delivery_methods where code = p_method;

  v_ship := jsonb_build_object(
    'recipient_name', v_addr.recipient_name, 'phone', v_addr.phone, 'region', v_addr.region,
    'city', v_addr.city, 'street', v_addr.street, 'landmark', v_addr.landmark,
    'digital_address', v_addr.digital_address, 'lat', v_addr.lat, 'lng', v_addr.lng,
    'country_code', v_addr.country_code);

  for v_chk in
    select i.variant_id, i.qty, v.id as vid, v.is_active, v.stock_qty, p.title, f.id as fid
      from (select (x ->> 'variant_id')::uuid as variant_id, sum((x ->> 'qty')::int) as qty
              from jsonb_array_elements(p_items) x group by 1) i
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
      left join public.product_feed f on f.id = p.id
  loop
    if v_chk.vid is null then raise exception 'variant_not_found'; end if;
    if v_chk.qty < 1 or v_chk.qty > 99 then raise exception 'bad_quantity: %', v_chk.title; end if;
    if v_chk.fid is null or not v_chk.is_active then raise exception 'unavailable: %', v_chk.title; end if;
    if v_chk.stock_qty < v_chk.qty then
      raise exception 'out_of_stock: % (only % left)', v_chk.title, v_chk.stock_qty;
    end if;
  end loop;

  create temporary table _co_lines (
    variant_id uuid, product_id uuid, shop_id uuid, title text, variant_label text, image_url text,
    qty int, unit_price numeric(12,2), seller_disc numeric(12,2), platform_disc numeric(12,2),
    campaign_id uuid, seller_base numeric(12,2), weight_kg numeric
  ) on commit drop;

  insert into _co_lines
  select v.id, p.id, p.shop_id, p.title, v.label,
         (select pm.url from public.product_media pm
           where pm.product_id = p.id and pm.kind = 'image'
           order by (pm.slot = 'in_use') desc, pm.is_primary desc, pm.position limit 1),
         i.qty,
         case when v.price_override is not null then v.price_override else f.price end,
         case when v.price_override is not null then 0 else f.price - f.current_price end,
         case when v.price_override is null and f.display_price < f.current_price
              then f.current_price - f.display_price else 0 end,
         case when v.price_override is null and f.display_price < f.current_price then f.campaign_id end,
         case when v.price_override is not null then v.price_override else f.current_price end,
         coalesce(p.weight_kg, 0.5) * i.qty
    from (select (x ->> 'variant_id')::uuid as variant_id, sum((x ->> 'qty')::int)::int as qty
            from jsonb_array_elements(p_items) x group by 1) i
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
    join public.product_feed f on f.id = p.id;

  insert into public.orders (buyer_id, ship_to, delivery_method_code, delivery_speed_code)
  values (p_buyer, v_ship, p_method, p_speed)
  returning id, order_number into v_order, v_number;

  for v_shop in
    select s.id, s.region, s.commission_pct
      from public.shops s where s.id in (select shop_id from _co_lines) order by s.name, s.id
  loop
    v_idx := v_idx + 1;

    select * into v_fee from public._package_fee(p_method, p_speed, v_shop.region, v_addr,
             (select sum(weight_kg) from _co_lines where shop_id = v_shop.id));
    if not found then raise exception 'delivery_unavailable'; end if;

    insert into public.packages (order_id, shop_id, package_index, ship_to, delivery_fee, commission_pct, eta_from, eta_to,
                                 delivery_method, courier_name, delivery_method_code, delivery_speed_code)
    values (v_order, v_shop.id, v_idx, v_ship, v_fee.fee, v_shop.commission_pct,
            current_date + v_fee.min_days, current_date + v_fee.max_days,
            v_meth.carrier, case when v_meth.carrier = 'rider' then null else v_meth.label end, p_method, p_speed)
    returning id into v_pkg;

    insert into public.order_items
      (package_id, product_id, variant_id, title, variant_label, image_url, quantity,
       unit_price, seller_discount_per_unit, platform_discount_per_unit, campaign_id)
    select v_pkg, product_id, variant_id, title, variant_label, image_url, qty,
           unit_price, seller_disc, platform_disc, campaign_id
      from _co_lines where shop_id = v_shop.id;

    update public.packages pk
       set subtotal = (select coalesce(sum(oi.line_total), 0) from public.order_items oi where oi.package_id = pk.id),
           commission_amount = round(c.base * v_shop.commission_pct / 100, 2),
           shop_earnings = c.base - round(c.base * v_shop.commission_pct / 100, 2)
      from (select coalesce(sum(seller_base * qty), 0) as base from _co_lines where shop_id = v_shop.id) c
     where pk.id = v_pkg;
  end loop;

  select coalesce(sum(seller_disc * qty), 0), coalesce(sum(platform_disc * qty), 0) into v_sd, v_pd from _co_lines;

  update public.orders o
     set subtotal = t.sub, delivery_total = t.del, seller_discount_total = v_sd, platform_discount_total = v_pd,
         total = t.sub + t.del
    from (select coalesce(sum(subtotal), 0) as sub, coalesce(sum(delivery_fee), 0) as del
            from public.packages where order_id = v_order) t
   where o.id = v_order
   returning o.total into v_total;

  if v_total <= 0 then raise exception 'invalid_total'; end if;

  v_ref := 'ebn_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payments (order_id, reference, amount) values (v_order, v_ref, v_total);

  return jsonb_build_object('order_id', v_order, 'order_number', v_number, 'total', v_total, 'reference', v_ref);
end $$;
revoke execute on function public.create_order(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant  execute on function public.create_order(uuid, uuid, jsonb, text, text) to service_role;
