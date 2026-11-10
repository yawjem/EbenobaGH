-- Product photo slots, product weight, and the "products on this offer" list. Run after 007.
--
-- Photos: every product has up to 6 pictures =
--   1 "in the box" (packaging)  +  1 "out of the box / in use"  +  up to 4 extra views.
-- A seller cannot publish (make Live) until the first two exist. Old products are left as they are.

alter table public.product_media
  add column slot text not null default 'view' check (slot in ('box', 'in_use', 'view'));
create unique index product_media_one_box    on public.product_media (product_id) where slot = 'box';
create unique index product_media_one_in_use on public.product_media (product_id) where slot = 'in_use';

-- Weight in kg, used for international shipping (FedEx) pricing.
alter table public.products
  add column weight_kg numeric(8,3) not null default 0.5 check (weight_kg >= 0 and weight_kg <= 1000);

-- At most 6 pictures per product (sellers; admins are not limited) ----------------
create function public.guard_media_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if (select count(*) from public.product_media where product_id = new.product_id) >= 6 then
      raise exception 'A product can have at most 6 pictures';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_media_insert before insert on public.product_media
  for each row execute function public.guard_media_insert();

-- The two required pictures can be replaced (update the row) but not deleted while the product is live.
-- Deleting the whole product still works: by then the product row is already gone.
create function public.guard_media_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and old.slot in ('box', 'in_use')
     and exists (select 1 from public.products p where p.id = old.product_id and p.status = 'active') then
    raise exception 'pictures_required: replace the picture instead of deleting it, or hide the product first';
  end if;
  return old;
end $$;
create trigger trg_guard_media_delete before delete on public.product_media
  for each row execute function public.guard_media_delete();

-- Publishing rule (same function as before plus the picture check) -------------------
create or replace function public.guard_product_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_featured := false;
    elsif new.is_featured is distinct from old.is_featured then
      raise exception 'Only an admin can feature products';
    end if;

    if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
      if tg_op = 'INSERT'
         or not exists (select 1 from public.product_media where product_id = new.id and slot = 'box')
         or not exists (select 1 from public.product_media where product_id = new.id and slot = 'in_use') then
        raise exception 'pictures_required: add a picture of the product in its box and one out of the box or in use, then publish';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Buyer-facing card picture: the "in use" shot first, then the old primary rule.
create or replace view public.product_feed with (security_invoker = true) as
with base as (
  select p.*,
    case when p.sale_price is not null
          and (p.sale_starts_at is null or p.sale_starts_at <= now())
          and (p.sale_ends_at   is null or p.sale_ends_at   >= now())
         then p.sale_price end as seller_sale_price
  from public.products p
)
select
  b.id, b.shop_id, s.name as shop_name, s.rating_avg as shop_rating,
  b.category_id, b.brand_id, b.title, b.description, b.specs,
  b.price,
  coalesce(b.seller_sale_price, b.price) as current_price,
  ac.campaign_id, ac.kind as campaign_kind, ac.discount_value as campaign_value,
  least(
    coalesce(b.seller_sale_price, b.price),
    case ac.kind
      when 'percent' then round(b.price * (1 - ac.discount_value / 100), 2)
      when 'fixed'   then greatest(b.price - ac.discount_value, 0)
    end
  ) as display_price,
  b.is_featured, b.is_returnable, b.rating_avg, b.rating_count, b.created_at,
  (select pm.url from public.product_media pm
    where pm.product_id = b.id and pm.kind = 'image'
    order by (pm.slot = 'in_use') desc, pm.is_primary desc, pm.position limit 1) as image_url,
  exists (select 1 from public.product_variants v
           where v.product_id = b.id and v.is_active and v.stock_qty > 0) as in_stock
from base b
join public.shops s on s.id = b.shop_id
left join lateral public.active_campaign_for_product(b.id) ac on true
where b.status = 'active' and s.status = 'active';

-- "See all" page for an offer banner: every live product the offer applies to ---------
-- (display_price already reflects whichever discount is lowest for that product)
create function public.campaign_products(p_campaign uuid, p_limit int default 120)
returns setof public.product_feed
language sql stable set search_path = public as $$
  select f.*
    from public.product_feed f
    join public.campaigns c on c.id = p_campaign
   where c.is_active and now() between c.starts_at and c.ends_at
     and exists (
       select 1 from public.campaign_targets t
        where t.campaign_id = c.id and (
              (t.kind = 'shop'     and t.target_id = f.shop_id)
           or (t.kind = 'brand'    and t.target_id = f.brand_id)
           or (t.kind = 'category' and t.target_id = f.category_id)
           or (t.kind = 'product'  and t.target_id = f.id)))
   order by (f.price - f.display_price) / nullif(f.price, 0) desc nulls last, f.created_at desc
   limit least(greatest(coalesce(p_limit, 120), 1), 300)
$$;
grant execute on function public.campaign_products(uuid, int) to anon, authenticated;
