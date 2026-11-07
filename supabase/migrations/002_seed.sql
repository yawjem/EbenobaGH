-- =====================================================================
-- EBENOBA - sample data for development (safe to delete before launch)
-- Run AFTER 001_init_schema.sql. Shops have no owner yet; assign one
-- later: update public.shops set owner_id = '<profile id>' where slug = '...';
-- =====================================================================

insert into public.categories (name, slug, position) values
  ('Phones & Tablets', 'phones-tablets', 1),
  ('Electronics',      'electronics',    2),
  ('Fashion',          'fashion',        3),
  ('Home & Kitchen',   'home-kitchen',   4),
  ('Beauty & Health',  'beauty-health',  5);

insert into public.categories (parent_id, name, slug, position) values
  ((select id from public.categories where slug = 'phones-tablets'), 'Smartphones', 'smartphones', 1),
  ((select id from public.categories where slug = 'electronics'),    'Laptops',     'laptops',     1),
  ((select id from public.categories where slug = 'electronics'),    'Televisions', 'televisions', 2),
  ((select id from public.categories where slug = 'fashion'),        'Sneakers',    'sneakers',    1),
  ((select id from public.categories where slug = 'home-kitchen'),   'Blenders',    'blenders',    1);

insert into public.brands (name) values
  ('Samsung'), ('HP'), ('Hisense'), ('Nike'), ('Binatone'), ('Tecno');

insert into public.shops (name, slug, description, region, city, status, commission_pct) values
  ('Kumasi Gadgets',  'kumasi-gadgets',  'Phones, laptops and accessories',   'Ashanti',       'Kumasi', 'active', 10),
  ('Accra Home Hub',  'accra-home-hub',  'Appliances and kitchen essentials', 'Greater Accra', 'Accra',  'active', 10),
  ('Sole Street GH',  'sole-street-gh',  'Sneakers and streetwear',           'Ashanti',       'Kumasi', 'active', 12);

insert into public.delivery_rates (from_region, to_region, fee, eta_min_days, eta_max_days) values
  ('ANY',           'ANY',            60, 3, 6),
  ('Ashanti',       'Ashanti',        20, 1, 2),
  ('Greater Accra', 'Greater Accra',  20, 1, 2),
  ('Ashanti',       'Greater Accra',  45, 2, 4),
  ('Greater Accra', 'Ashanti',        45, 2, 4);

do $$
declare
  v record;
  pid uuid;
begin
  for v in select * from (values
    ('kumasi-gadgets','smartphones','Samsung','Galaxy A15 128GB',
     'Reliable everyday smartphone with a bright display and long battery life.',
     1450.00, 1299.00,
     '[{"label":"Black","stock":15},{"label":"Blue","stock":8}]'::jsonb),
    ('kumasi-gadgets','smartphones','Tecno','Spark 20 Pro 256GB',
     'Big storage, smooth screen and fast charging at a friendly price.',
     1650.00, null,
     '[{"label":"Default","stock":20}]'::jsonb),
    ('kumasi-gadgets','laptops','HP','HP 15 Laptop, Core i5, 16GB RAM',
     'Capable laptop for study, office work and programming.',
     5200.00, 4800.00,
     '[{"label":"512GB SSD","stock":6}]'::jsonb),
    ('accra-home-hub','televisions','Hisense','Hisense 43" Smart TV',
     'Full HD smart television with built-in streaming apps.',
     3100.00, null,
     '[{"label":"Default","stock":10}]'::jsonb),
    ('accra-home-hub','blenders','Binatone','Binatone 1.5L Blender',
     'Powerful blender for smoothies, soups and sauces.',
     280.00, 240.00,
     '[{"label":"Default","stock":40}]'::jsonb),
    ('sole-street-gh','sneakers','Nike','Nike Air Max Everyday',
     'Comfortable cushioned sneakers for daily wear.',
     950.00, null,
     '[{"label":"EU 41","stock":5},{"label":"EU 42","stock":7},{"label":"EU 43","stock":4}]'::jsonb)
  ) as t(shop_slug, cat_slug, brand_name, title, descr, price, sale_price, variants)
  loop
    insert into public.products (shop_id, category_id, brand_id, title, description, price, sale_price, status)
    values (
      (select id from public.shops where slug = v.shop_slug),
      (select id from public.categories where slug = v.cat_slug),
      (select id from public.brands where name = v.brand_name),
      v.title, v.descr, v.price, v.sale_price, 'active')
    returning id into pid;

    insert into public.product_media (product_id, url, is_primary, position)
    values (pid, 'https://picsum.photos/seed/' || md5(v.title) || '/800/800', true, 0);

    insert into public.product_variants (product_id, sku, label, stock_qty)
    select pid, upper(substr(md5(v.title || (x ->> 'label')), 1, 8)), x ->> 'label', (x ->> 'stock')::int
      from jsonb_array_elements(v.variants) x;
  end loop;
end $$;

-- Sample platform promotion: 15% off everything from one shop, for a week
with c as (
  insert into public.campaigns (name, discount_type, discount_value, starts_at, ends_at, budget_cap)
  values ('Welcome Week', 'percent', 15, now(), now() + interval '7 days', 5000)
  returning id)
insert into public.campaign_targets (campaign_id, kind, target_id)
select c.id, 'shop', (select id from public.shops where slug = 'accra-home-hub') from c;
