-- =====================================================================
-- create_order: the ONLY way an order comes into existence.
-- Called by the `checkout` Edge Function with the service_role key.
--
-- Prices are NEVER taken from the app. Everything is re-priced here from the
-- product_feed view, in one transaction, so there are no half-built orders.
--
-- Pricing rules (match the buyer-facing product_feed):
--   * One discount per product, the lowest price wins (no stacking).
--   * Seller sale wins  -> seller pays the discount.
--   * Platform promo wins -> the seller is still credited as if sold at THEIR
--     price (list price minus their own sale, if any); Ebenoba pays the rest.
--   * A variant with price_override is sold at exactly that price, no discounts.
--   * Commission is charged on the seller's price, per package, using the rate
--     snapshot at order time. Delivery fees belong to the platform (riders), not the shop.
--
-- Errors are raised as 'code: detail' so the Edge Function can map them.
-- =====================================================================

create or replace function public.create_order(p_buyer uuid, p_address uuid, p_items jsonb)
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
  v_rate   record;
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

  select * into v_addr from public.addresses where id = p_address and user_id = p_buyer;
  if not found then raise exception 'address_not_found'; end if;

  v_ship := jsonb_build_object(
    'recipient_name', v_addr.recipient_name, 'phone', v_addr.phone, 'region', v_addr.region,
    'city', v_addr.city, 'street', v_addr.street, 'landmark', v_addr.landmark,
    'digital_address', v_addr.digital_address, 'lat', v_addr.lat, 'lng', v_addr.lng);

  -- Validate every line (duplicates of the same variant are merged first).
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
    campaign_id uuid, seller_base numeric(12,2)
  ) on commit drop;

  insert into _co_lines
  select v.id, p.id, p.shop_id, p.title, v.label,
         (select pm.url from public.product_media pm
           where pm.product_id = p.id and pm.kind = 'image' order by pm.is_primary desc, pm.position limit 1),
         i.qty,
         case when v.price_override is not null then v.price_override else f.price end,
         case when v.price_override is not null then 0 else f.price - f.current_price end,
         case when v.price_override is null and f.display_price < f.current_price
              then f.current_price - f.display_price else 0 end,
         case when v.price_override is null and f.display_price < f.current_price then f.campaign_id end,
         case when v.price_override is not null then v.price_override else f.current_price end
    from (select (x ->> 'variant_id')::uuid as variant_id, sum((x ->> 'qty')::int)::int as qty
            from jsonb_array_elements(p_items) x group by 1) i
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
    join public.product_feed f on f.id = p.id;

  insert into public.orders (buyer_id, ship_to) values (p_buyer, v_ship)
  returning id, order_number into v_order, v_number;

  for v_shop in
    select s.id, s.region, s.commission_pct
      from public.shops s where s.id in (select shop_id from _co_lines) order by s.name, s.id
  loop
    v_idx := v_idx + 1;

    -- most specific delivery rate wins: (shop region -> buyer region), then (ANY -> buyer), (shop -> ANY), (ANY -> ANY)
    select r.fee, r.eta_min_days, r.eta_max_days into v_rate
      from public.delivery_rates r
     where r.from_region in (coalesce(v_shop.region, 'ANY'), 'ANY')
       and r.to_region in (v_addr.region, 'ANY')
     order by (r.from_region = 'ANY')::int + (r.to_region = 'ANY')::int
     limit 1;
    if not found then raise exception 'no_delivery_rate'; end if;

    insert into public.packages (order_id, shop_id, package_index, ship_to, delivery_fee, commission_pct, eta_from, eta_to)
    values (v_order, v_shop.id, v_idx, v_ship, v_rate.fee, v_shop.commission_pct,
            current_date + v_rate.eta_min_days, current_date + v_rate.eta_max_days)
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

revoke execute on function public.create_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.create_order(uuid, uuid, jsonb) to service_role;
