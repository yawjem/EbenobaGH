-- =====================================================================
-- EBENOBA MARKETPLACE - initial schema (Supabase / PostgreSQL 15+)
--
-- Model: one shared catalogue. Products belong to a shop (shop_id) but
-- buyers browse everything mixed together. One payment = one ORDER,
-- split into one PACKAGE per shop. Each package has its own status,
-- delivery, earnings and notifications.
--
-- Security notes:
--  * Orders, order items, payments, ledger entries are created by Edge
--    Functions using the service_role key (prices are never trusted
--    from the app). Clients only READ them.
--  * Money fields on packages are locked for sellers and riders.
--  * Shops/commission/roles can only be changed by an admin.
--  * Run this in the SQL editor or as a CLI migration.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('buyer','seller','rider','admin');
create type public.shop_status    as enum ('pending','active','suspended');
create type public.product_status as enum ('draft','active','archived');
create type public.media_type     as enum ('image','video');
create type public.order_status   as enum ('awaiting_payment','paid','cancelled','expired');
create type public.package_status as enum (
  'new','paid','processing','ready','assigned','dispatched','in_transit',
  'awaiting_pickup','delivered','completed','cancelled','returned','refunded');
create type public.payment_status as enum ('pending','success','failed','refunded');
create type public.delivery_method as enum ('rider','courier','pickup');
create type public.discount_type  as enum ('percent','fixed');
create type public.target_type    as enum ('shop','brand','category','product');
create type public.ledger_type    as enum ('sale_earning','refund_deduction','payout','adjustment');
create type public.ledger_status  as enum ('pending','available','paid_out','void');
create type public.return_status  as enum (
  'requested','approved','rejected','escalated','item_returning','received','refunded','closed');
create type public.complaint_status as enum ('open','in_review','resolved','closed');
create type public.event_type     as enum ('view','search','wishlist_add','cart_add','purchase');

-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text unique,
  role public.user_role not null default 'buyer',
  avatar_url text,
  push_token text,
  tracking_consent boolean not null default false,   -- behaviour tracking opt-in
  promo_push_enabled boolean not null default true,  -- global off switch for promo pushes
  quiet_hours_start time not null default '21:00',
  quiet_hours_end   time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),      -- nullable so seed shops can exist
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  phone text,
  address_text text,
  region text,                                       -- used for delivery fee zones
  city text,
  lat double precision,
  lng double precision,
  status public.shop_status not null default 'pending',
  commission_pct numeric(5,2) not null default 10 check (commission_pct between 0 and 100),
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sensitive payout info is kept OFF the public shops table.
create table public.shop_payout_details (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  paystack_subaccount_code text,
  momo_network text,
  momo_number text,
  bank_name text,
  bank_account_number text,
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  image_url text,
  position int not null default 0
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  title text not null,
  description text,
  specs jsonb not null default '{}'::jsonb,
  price numeric(12,2) not null check (price >= 0),
  -- seller-funded discount (optional, scheduled)
  sale_price numeric(12,2) check (sale_price is null or sale_price < price),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,        -- admin only
  is_returnable boolean not null default true,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  kind public.media_type not null default 'image',
  position int not null default 0,
  is_primary boolean not null default false
);

-- EVERY product has at least one variant (use label 'Default' if it has none).
-- Stock lives on the variant.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  label text not null default 'Default',
  attributes jsonb not null default '{}'::jsonb,     -- {"size":"M","colour":"Red"}
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  stock_qty int not null default 0 check (stock_qty >= 0),
  is_active boolean not null default true
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  region text not null,
  city text not null,
  street text,
  landmark text,
  digital_address text,                              -- Ghana Post GPS
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.wishlist_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity int not null check (quantity > 0),
  saved_for_later boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);

-- Delivery fee per package by region pair. 'ANY' is the fallback.
create table public.delivery_rates (
  id uuid primary key default gen_random_uuid(),
  from_region text not null default 'ANY',
  to_region text not null default 'ANY',
  fee numeric(10,2) not null check (fee >= 0),
  eta_min_days int not null default 1,
  eta_max_days int not null default 3,
  unique (from_region, to_region)
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text
);

-- Platform-funded promotions (Black Friday etc.)
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  banner_url text,
  discount_type public.discount_type not null,
  discount_value numeric(12,2) not null check (discount_value > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  budget_cap numeric(12,2),                           -- null = unlimited
  budget_spent numeric(12,2) not null default 0,
  per_customer_limit int,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.campaign_targets (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind public.target_type not null,
  target_id uuid not null,                            -- id of the shop/brand/category/product
  primary key (campaign_id, kind, target_id)
);

create sequence public.order_number_seq start 10000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default
    ('EB-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0')),
  buyer_id uuid not null references public.profiles(id),
  ship_to jsonb not null,                             -- address snapshot
  subtotal numeric(12,2) not null default 0,
  delivery_total numeric(12,2) not null default 0,
  seller_discount_total numeric(12,2) not null default 0,
  platform_discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,             -- what the buyer pays
  status public.order_status not null default 'awaiting_payment',
  needs_review boolean not null default false,        -- e.g. paid but stock ran out
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'paystack',
  reference text not null unique,
  amount numeric(12,2) not null,                      -- in GHS (not pesewas)
  currency text not null default 'GHS',
  channel text,                                       -- mobile_money | card | bank_transfer
  status public.payment_status not null default 'pending',
  failure_reason text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

-- Idempotency for payment webhooks
create table public.webhook_events (
  id text primary key,
  provider text not null default 'paystack',
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- A package = the part of an order that comes from one shop.
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id),
  package_index smallint not null default 1,
  status public.package_status not null default 'new',
  ship_to jsonb not null,                             -- so sellers/riders never need the orders table
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  commission_pct numeric(5,2) not null default 0,     -- snapshot at order time
  commission_amount numeric(12,2) not null default 0,
  shop_earnings numeric(12,2) not null default 0,
  delivery_method public.delivery_method not null default 'rider',
  rider_id uuid references public.profiles(id),
  courier_name text,                                  -- e.g. Shaq Express
  tracking_number text,
  eta_from date,
  eta_to date,
  delivered_at timestamptz,
  delivered_to_name text,
  payout_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  title text not null,                                -- snapshots
  variant_label text,
  image_url text,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),            -- list price
  seller_discount_per_unit numeric(12,2) not null default 0 check (seller_discount_per_unit >= 0),
  platform_discount_per_unit numeric(12,2) not null default 0 check (platform_discount_per_unit >= 0),
  campaign_id uuid references public.campaigns(id),
  unit_price_paid numeric(12,2) generated always as
    (greatest(unit_price - seller_discount_per_unit - platform_discount_per_unit, 0)) stored,
  line_total numeric(12,2) generated always as
    (greatest(unit_price - seller_discount_per_unit - platform_discount_per_unit, 0) * quantity) stored
);

create table public.package_status_history (
  id bigint generated always as identity primary key,
  package_id uuid not null references public.packages(id) on delete cascade,
  status public.package_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz not null default now()
);

-- Shop earnings ledger. Positive = owed to shop, negative = deducted/paid out.
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  package_id uuid references public.packages(id),
  entry_type public.ledger_type not null,
  amount numeric(12,2) not null,
  status public.ledger_status not null default 'pending',
  available_at timestamptz,                           -- earnings are held until this time
  note text,
  created_at timestamptz not null default now()
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  amount numeric(12,2) not null check (amount > 0),
  method text,
  reference text,
  status text not null default 'pending',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id),
  order_item_id uuid references public.order_items(id),
  shop_id uuid references public.shops(id),
  buyer_id uuid not null references public.profiles(id),
  reason text not null check (reason in
    ('defective','wrong_item','not_as_described','changed_mind','other')),
  details text,
  photos text[] not null default '{}',
  status public.return_status not null default 'requested',
  seller_note text,
  seller_due_at timestamptz,
  seller_responded_at timestamptz,
  admin_note text,
  refund_amount numeric(12,2),
  return_shipping_paid_by text check (return_shipping_paid_by in ('seller','buyer','platform')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  package_id uuid references public.packages(id),
  shop_id uuid references public.shops(id),
  rider_id uuid references public.profiles(id),
  category text not null check (category in
    ('not_delivered','late_delivery','seller_issue','rider_issue','payment','app_bug','other')),
  subject text not null,
  status public.complaint_status not null default 'open',
  ruling text,
  ruling_amount numeric(12,2),
  cost_borne_by text check (cost_borne_by in ('seller','platform','buyer','none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  attachments text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id),
  buyer_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Behaviour tracking ---------------------------------------------------
create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  device_id text,                                     -- guests; merged on sign-up
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  event_type public.event_type not null,
  duration_seconds int check (duration_seconds is null or duration_seconds between 0 and 86400),
  search_query text,
  created_at timestamptz not null default now(),
  check (user_id is not null or device_id is not null)
);

create table public.user_product_interest (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  score numeric(10,3) not null default 0,
  view_count int not null default 0,
  total_seconds int not null default 0,
  last_event_at timestamptz,
  primary key (user_id, product_id)
);

-- Notifications ----------------------------------------------------------
-- Triggers write here; an Edge Function worker sends push + SMS + email.
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,                                 -- e.g. package_dispatched
  payload jsonb not null default '{}'::jsonb,
  channels text[] not null default '{push,sms,email}',
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.promo_notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------
create index on public.products (shop_id);
create index on public.products (category_id);
create index on public.products (brand_id);
create index on public.products (status);
create index on public.products using gin (search_vector);
create index on public.products using gin (title extensions.gin_trgm_ops);
create index on public.product_media (product_id);
create index on public.product_variants (product_id);
create index on public.categories (parent_id);
create index on public.orders (buyer_id, created_at desc);
create index on public.packages (order_id);
create index on public.packages (shop_id, status);
create index on public.packages (rider_id, status);
create index on public.order_items (package_id);
create index on public.ledger_entries (shop_id, status);
create index on public.return_requests (shop_id, status);
create index on public.complaints (shop_id, status);
create index on public.product_events (user_id, created_at desc);
create index on public.product_events (device_id, created_at desc);
create index on public.product_events (product_id);
create index on public.notification_outbox (status, created_at);
create index on public.promo_notification_log (user_id, sent_at desc);
create index on public.campaign_targets (kind, target_id);

-- ---------------------------------------------------------------------
-- HELPER FUNCTIONS
-- ---------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.owns_shop(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops where id = p_shop and owner_id = auth.uid())
$$;

create function public.setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from public.platform_settings where key = p_key
$$;

-- Create a buyer profile for every new auth user. Role is ALWAYS 'buyer'
-- here; an admin promotes users to seller/rider/admin.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (new.id, new.email, nullif(new.phone,''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at triggers
create trigger trg_profiles_updated  before update on public.profiles  for each row execute function public.set_updated_at();
create trigger trg_shops_updated     before update on public.shops     for each row execute function public.set_updated_at();
create trigger trg_products_updated  before update on public.products  for each row execute function public.set_updated_at();
create trigger trg_orders_updated    before update on public.orders    for each row execute function public.set_updated_at();
create trigger trg_packages_updated  before update on public.packages  for each row execute function public.set_updated_at();
create trigger trg_returns_updated   before update on public.return_requests for each row execute function public.set_updated_at();
create trigger trg_complaints_updated before update on public.complaints for each row execute function public.set_updated_at();

-- Guards: non-admins cannot escalate privileges --------------------------
create function public.guard_profile_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.role is distinct from old.role then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

create function public.guard_shop_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.commission_pct is distinct from old.commission_pct
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Only an admin can change shop status, commission or owner';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_shop before update on public.shops
  for each row execute function public.guard_shop_update();

create function public.guard_product_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_featured := false;
    elsif new.is_featured is distinct from old.is_featured then
      raise exception 'Only an admin can feature products';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_product before insert or update on public.products
  for each row execute function public.guard_product_write();

-- Package workflow guard + stamps -----------------------------------------
create function public.guard_package_update() returns trigger
language plpgsql set search_path = public as $$
begin
  -- auth.uid() is null for service_role / SQL editor = trusted.
  if auth.uid() is not null and not public.is_admin() then
    if new.order_id is distinct from old.order_id
       or new.shop_id is distinct from old.shop_id
       or new.subtotal is distinct from old.subtotal
       or new.delivery_fee is distinct from old.delivery_fee
       or new.commission_pct is distinct from old.commission_pct
       or new.commission_amount is distinct from old.commission_amount
       or new.shop_earnings is distinct from old.shop_earnings then
      raise exception 'Financial fields are read-only';
    end if;
    if new.rider_id is distinct from old.rider_id then
      raise exception 'Only an admin can assign riders';
    end if;
    if new.status is distinct from old.status then
      if old.status in ('new','cancelled','completed','returned','refunded') then
        raise exception 'Package cannot be changed from status %', old.status;
      end if;
      if old.rider_id = auth.uid() then
        if new.status not in ('in_transit','delivered') then
          raise exception 'Riders can only mark in_transit or delivered';
        end if;
      elsif public.owns_shop(old.shop_id) then
        if new.status not in ('processing','ready','awaiting_pickup','dispatched','cancelled') then
          raise exception 'Sellers cannot set status %', new.status;
        end if;
        if new.status = 'cancelled' and old.status in ('dispatched','in_transit','awaiting_pickup','delivered') then
          raise exception 'Too late to cancel';
        end if;
      else
        raise exception 'Not allowed to change this package';
      end if;
    end if;
  end if;

  if new.status is distinct from old.status and new.status = 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
    new.payout_release_at :=
      now() + make_interval(days => coalesce(public.setting_num('payout_hold_days'), 7)::int);
  end if;
  return new;
end $$;
create trigger trg_guard_package before update on public.packages
  for each row execute function public.guard_package_update();

-- History + notifications on every status change
create function public.on_package_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_buyer uuid; v_order_no text; v_shop text;
begin
  if tg_op = 'INSERT' then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());

    -- earnings become claimable only after the return window
    if new.status = 'delivered' then
      update public.ledger_entries
         set available_at = new.payout_release_at
       where package_id = new.id and status = 'pending' and entry_type = 'sale_earning';
    end if;

    if new.status in ('paid','ready','dispatched','in_transit','awaiting_pickup','delivered','cancelled') then
      select o.buyer_id, o.order_number into v_buyer, v_order_no
        from public.orders o where o.id = new.order_id;
      select name into v_shop from public.shops where id = new.shop_id;
      insert into public.notification_outbox (user_id, kind, payload)
      values (v_buyer, 'package_' || new.status::text, jsonb_build_object(
        'package_id', new.id, 'order_id', new.order_id, 'order_number', v_order_no,
        'shop_name', v_shop, 'courier_name', new.courier_name,
        'tracking_number', new.tracking_number, 'delivery_method', new.delivery_method));
    end if;
  end if;
  return new;
end $$;
create trigger trg_package_change after insert or update on public.packages
  for each row execute function public.on_package_change();

-- Returns: fill shop + deadline, then restrict who can change what
create function public.returns_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  select shop_id into new.shop_id from public.packages where id = new.package_id;
  new.seller_due_at := now() + make_interval(hours => coalesce(public.setting_num('seller_response_hours'), 48)::int);
  return new;
end $$;
create trigger trg_returns_before_insert before insert on public.return_requests
  for each row execute function public.returns_before_insert();

create function public.guard_return_update() returns trigger
language plpgsql set search_path = public as $$
declare
  v_allowed text[] := array['status','seller_note','seller_responded_at','updated_at'];
begin
  if auth.uid() is not null and not public.is_admin() then
    if public.owns_shop(old.shop_id) then
      if old.status <> 'requested' or new.status not in ('approved','rejected') then
        raise exception 'Sellers can only approve or reject a new return request';
      end if;
      if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
        raise exception 'Sellers can only respond to the request';
      end if;
      new.seller_responded_at := now();
    elsif old.buyer_id = auth.uid() then
      if not (old.status = 'rejected' and new.status = 'escalated')
         or (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
        raise exception 'Buyers can only escalate a rejected request';
      end if;
    else
      raise exception 'Not allowed';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_return before update on public.return_requests
  for each row execute function public.guard_return_update();

-- Keep product rating aggregates fresh
create function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.products p
     set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where product_id = new.product_id), 0),
         rating_count = (select count(*) from public.reviews where product_id = new.product_id)
   where p.id = new.product_id;
  return new;
end $$;
create trigger trg_review_rating after insert or update on public.reviews
  for each row execute function public.refresh_product_rating();

-- ---------------------------------------------------------------------
-- DISCOUNT LOOKUP
-- Best active platform campaign for a product. If you later allow
-- stacking (settings: stack_discounts), change display_price in the view
-- and the checkout Edge Function together.
-- ---------------------------------------------------------------------
create function public.active_campaign_for_product(p_product uuid)
returns table (campaign_id uuid, kind public.discount_type, discount_value numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.discount_type, c.discount_value
  from public.campaigns c
  join public.products p on p.id = p_product
  where c.is_active
    and now() between c.starts_at and c.ends_at
    and (c.budget_cap is null or c.budget_spent < c.budget_cap)
    and exists (
      select 1 from public.campaign_targets t
      where t.campaign_id = c.id and (
           (t.kind = 'shop'     and t.target_id = p.shop_id)
        or (t.kind = 'brand'    and t.target_id = p.brand_id)
        or (t.kind = 'category' and t.target_id = p.category_id)
        or (t.kind = 'product'  and t.target_id = p.id)))
  order by case when c.discount_type = 'percent'
                then p.price * c.discount_value / 100
                else c.discount_value end desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- BUYER-FACING PRODUCT FEED (all shops mixed together)
-- Use this view for home, categories, search, wishlist, recommendations.
-- ---------------------------------------------------------------------
create view public.product_feed with (security_invoker = true) as
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
    order by pm.is_primary desc, pm.position limit 1) as image_url,
  exists (select 1 from public.product_variants v
           where v.product_id = b.id and v.is_active and v.stock_qty > 0) as in_stock
from base b
join public.shops s on s.id = b.shop_id
left join lateral public.active_campaign_for_product(b.id) ac on true
where b.status = 'active' and s.status = 'active';

-- Related products (same category/brand, similar price)
create function public.related_products(p_product uuid, p_limit int default 12)
returns setof public.product_feed
language sql stable set search_path = public as $$
  select f.*
  from public.product_feed f
  join public.product_feed src on src.id = p_product
  where f.id <> src.id
    and (f.category_id = src.category_id or (f.brand_id is not null and f.brand_id = src.brand_id))
  order by coalesce((f.category_id = src.category_id)::int, 0) * 2
         + coalesce((f.brand_id = src.brand_id)::int, 0)
         + (case when f.price between src.price * 0.5 and src.price * 1.5 then 1 else 0 end) desc,
           f.created_at desc
  limit p_limit
$$;

-- ---------------------------------------------------------------------
-- TRACKING + RECOMMENDATIONS
-- ---------------------------------------------------------------------
-- Guest -> account merge (call right after sign-up/login)
create function public.claim_device_events(p_device_id text) returns void
language sql security definer set search_path = public as $$
  update public.product_events
     set user_id = auth.uid()
   where device_id = p_device_id and user_id is null and auth.uid() is not null
$$;

-- User withdrew consent / wants data removed
create function public.delete_my_tracking_data() returns void
language sql security definer set search_path = public as $$
  delete from public.product_events where user_id = auth.uid();
  delete from public.user_product_interest where user_id = auth.uid();
$$;

-- Interest score: dwell time (capped), return visits on different days,
-- wishlist/cart actions, decayed with a 14-day half-life-ish curve.
-- Schedule every ~30 minutes (see bottom of file).
create function public.refresh_user_interest() returns void
language sql security definer set search_path = public as $$
  insert into public.user_product_interest
    (user_id, product_id, category_id, score, view_count, total_seconds, last_event_at)
  select e.user_id, e.product_id, p.category_id,
    sum( (case e.event_type
            when 'view'         then least(coalesce(e.duration_seconds,0),180) / 30.0 + 1
            when 'wishlist_add' then 5
            when 'cart_add'     then 6
            else 0 end)
         * exp(-extract(epoch from (now() - e.created_at)) / 86400.0 / 14.0) )
      + 2 * greatest(count(distinct e.created_at::date) filter (where e.event_type = 'view') - 1, 0),
    count(*) filter (where e.event_type = 'view'),
    coalesce(sum(least(e.duration_seconds,180)) filter (where e.event_type = 'view'), 0),
    max(e.created_at)
  from public.product_events e
  join public.profiles pr on pr.id = e.user_id and pr.tracking_consent
  join public.products p on p.id = e.product_id
  where e.user_id is not null and e.product_id is not null
    and e.created_at > now() - interval '60 days'
  group by e.user_id, e.product_id, p.category_id
  on conflict (user_id, product_id) do update
    set score = excluded.score, view_count = excluded.view_count,
        total_seconds = excluded.total_seconds, last_event_at = excluded.last_event_at,
        category_id = excluded.category_id
$$;

create function public.recommended_products(p_limit int default 20)
returns setof public.product_feed
language sql stable set search_path = public as $$
  with cat as (
    select category_id, sum(score) as s from public.user_product_interest
    where user_id = auth.uid() group by category_id),
  prod as (
    select product_id, score from public.user_product_interest where user_id = auth.uid())
  select f.*
  from public.product_feed f
  left join cat  on cat.category_id = f.category_id
  left join prod on prod.product_id = f.id
  where cat.category_id is not null or prod.product_id is not null
  order by coalesce(prod.score, 0) + coalesce(cat.s, 0) * 0.5 desc, f.created_at desc
  limit p_limit
$$;

-- Anti-annoyance gate for PROMO pushes (order updates are never gated).
create function public.can_send_promo(p_user uuid, p_product uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  pr public.profiles%rowtype;
  t time := (now() at time zone 'Africa/Accra')::time;
  quiet boolean;
begin
  select * into pr from public.profiles where id = p_user;
  if not found or not pr.promo_push_enabled or pr.push_token is null then return false; end if;

  quiet := case when pr.quiet_hours_start > pr.quiet_hours_end
                then (t >= pr.quiet_hours_start or t < pr.quiet_hours_end)
                else (t >= pr.quiet_hours_start and t < pr.quiet_hours_end) end;
  if quiet then return false; end if;

  if (select count(*) from public.promo_notification_log
       where user_id = p_user and sent_at > now() - interval '1 day')
     >= coalesce(public.setting_num('max_promo_push_per_day'), 1) then return false; end if;

  if (select count(*) from public.promo_notification_log
       where user_id = p_user and sent_at > now() - interval '7 days')
     >= coalesce(public.setting_num('max_promo_push_per_week'), 3) then return false; end if;

  if exists (select 1 from public.promo_notification_log
              where user_id = p_user and product_id = p_product
                and sent_at > now() - make_interval(days => coalesce(public.setting_num('promo_per_product_days'), 7)::int))
  then return false; end if;

  return true;
end $$;

-- Who should hear about a discount on something they showed interest in?
-- The notifier Edge Function calls this, sends, logs each send in
-- promo_notification_log, and re-checks can_send_promo before each push.
create function public.price_drop_targets()
returns table (user_id uuid, product_id uuid, discount_pct numeric, score numeric)
language sql stable security definer set search_path = public as $$
  select i.user_id, f.id,
         round((1 - f.display_price / f.price) * 100, 0), i.score
  from public.user_product_interest i
  join public.product_feed f on f.id = i.product_id
  where f.price > 0
    and (1 - f.display_price / f.price) * 100 >= coalesce(public.setting_num('min_discount_pct_for_push'), 10)
    and i.score >= 3
    and public.can_send_promo(i.user_id, f.id)
  order by i.score desc
$$;

-- ---------------------------------------------------------------------
-- PAYMENT RECONCILIATION (called ONLY by the Paystack webhook Edge Function)
-- Idempotent. p_amount must be in GHS (convert from pesewas first).
-- ---------------------------------------------------------------------
create function public.mark_order_paid(
  p_reference text, p_amount numeric, p_channel text default null, p_raw jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments%rowtype;
  v_item record;
  v_rows int;
  v_note text := '';
  v_buyer uuid;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found then raise exception 'Unknown payment reference %', p_reference; end if;
  if v_pay.status = 'success' then return v_pay.order_id; end if;   -- already processed

  if p_amount < v_pay.amount then
    update public.payments
       set status = 'failed', failure_reason = 'amount_mismatch', raw = coalesce(p_raw, raw)
     where id = v_pay.id;
    update public.orders set needs_review = true,
           review_note = 'Payment amount mismatch on ' || p_reference
     where id = v_pay.order_id;
    return v_pay.order_id;
  end if;

  update public.payments
     set status = 'success', channel = coalesce(p_channel, channel),
         paid_at = now(), raw = coalesce(p_raw, raw)
   where id = v_pay.id;

  update public.orders set status = 'paid' where id = v_pay.order_id
  returning buyer_id into v_buyer;

  update public.packages set status = 'paid'
   where order_id = v_pay.order_id and status = 'new';

  -- deduct stock; flag the order if anything ran out meanwhile
  for v_item in
    select oi.id, oi.variant_id, oi.quantity
      from public.order_items oi
      join public.packages pk on pk.id = oi.package_id
     where pk.order_id = v_pay.order_id
  loop
    update public.product_variants
       set stock_qty = stock_qty - v_item.quantity
     where id = v_item.variant_id and stock_qty >= v_item.quantity;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      v_note := v_note || 'Insufficient stock for item ' || v_item.id || '; ';
    end if;
  end loop;
  if v_note <> '' then
    update public.orders set needs_review = true, review_note = v_note where id = v_pay.order_id;
  end if;

  -- pending earnings for each shop (released after the return window)
  insert into public.ledger_entries (shop_id, package_id, entry_type, amount, status, note)
  select pk.shop_id, pk.id, 'sale_earning', pk.shop_earnings, 'pending',
         'Order ' || (select order_number from public.orders where id = pk.order_id)
    from public.packages pk where pk.order_id = v_pay.order_id;

  -- platform campaign spend
  update public.campaigns c
     set budget_spent = c.budget_spent + s.spent
    from (select oi.campaign_id, sum(oi.platform_discount_per_unit * oi.quantity) as spent
            from public.order_items oi
            join public.packages pk on pk.id = oi.package_id
           where pk.order_id = v_pay.order_id and oi.campaign_id is not null
           group by oi.campaign_id) s
   where c.id = s.campaign_id;

  -- purchased items leave the cart
  delete from public.cart_items
   where user_id = v_buyer
     and variant_id in (select oi.variant_id from public.order_items oi
                          join public.packages pk on pk.id = oi.package_id
                         where pk.order_id = v_pay.order_id);

  return v_pay.order_id;
end $$;

-- Cancel orders nobody paid for (run every ~10 minutes)
create function public.expire_unpaid_orders(p_minutes int default 30) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with ex as (
    update public.orders set status = 'expired'
     where status = 'awaiting_payment' and created_at < now() - make_interval(mins => p_minutes)
     returning id),
  pk as (
    update public.packages set status = 'cancelled'
     where order_id in (select id from ex) and status = 'new'
     returning 1)
  select count(*) into n from ex;   -- returns number of ORDERS expired
  return n;
end $$;

-- Move earnings to 'available' once the hold has passed and no return is open
create function public.release_due_earnings() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.ledger_entries le
     set status = 'available'
   where le.status = 'pending' and le.entry_type = 'sale_earning'
     and le.available_at is not null and le.available_at <= now()
     and not exists (
       select 1 from public.return_requests r
        where r.package_id = le.package_id
          and r.status in ('requested','approved','escalated','item_returning','received'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Lock the privileged functions to the service role
revoke execute on function public.mark_order_paid(text, numeric, text, jsonb) from public, anon, authenticated;
revoke execute on function public.expire_unpaid_orders(int)      from public, anon, authenticated;
revoke execute on function public.release_due_earnings()         from public, anon, authenticated;
revoke execute on function public.refresh_user_interest()        from public, anon, authenticated;
revoke execute on function public.price_drop_targets()           from public, anon, authenticated;
revoke execute on function public.can_send_promo(uuid, uuid)     from public, anon, authenticated;
grant  execute on function public.mark_order_paid(text, numeric, text, jsonb) to service_role;
grant  execute on function public.expire_unpaid_orders(int)      to service_role;
grant  execute on function public.release_due_earnings()         to service_role;
grant  execute on function public.refresh_user_interest()        to service_role;
grant  execute on function public.price_drop_targets()           to service_role;
grant  execute on function public.can_send_promo(uuid, uuid)     to service_role;

-- ---------------------------------------------------------------------
-- DEFAULT SETTINGS (admin-editable)
-- ---------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('return_window_days',        '7',    'Days after delivery a buyer can request a return'),
  ('payout_hold_days',          '7',    'Days after delivery before earnings become payable'),
  ('seller_response_hours',     '48',   'Hours a seller has to answer a return request'),
  ('stack_discounts',           'false','Allow seller discount + platform promo together'),
  ('max_promo_push_per_day',    '1',    'Promo push cap per user per day'),
  ('max_promo_push_per_week',   '3',    'Promo push cap per user per week'),
  ('promo_per_product_days',    '7',    'Min days between promo pushes about the same product'),
  ('min_discount_pct_for_push', '10',   'Only push when the discount is at least this %'),
  ('default_commission_pct',    '10',   'Commission for new shops');

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.shops                enable row level security;
alter table public.shop_payout_details  enable row level security;
alter table public.categories           enable row level security;
alter table public.brands               enable row level security;
alter table public.products             enable row level security;
alter table public.product_media        enable row level security;
alter table public.product_variants     enable row level security;
alter table public.addresses            enable row level security;
alter table public.wishlist_items       enable row level security;
alter table public.cart_items           enable row level security;
alter table public.delivery_rates       enable row level security;
alter table public.platform_settings    enable row level security;
alter table public.campaigns            enable row level security;
alter table public.campaign_targets     enable row level security;
alter table public.orders               enable row level security;
alter table public.payments             enable row level security;
alter table public.webhook_events       enable row level security;   -- no policies: service role only
alter table public.packages             enable row level security;
alter table public.order_items          enable row level security;
alter table public.package_status_history enable row level security;
alter table public.ledger_entries       enable row level security;
alter table public.payouts              enable row level security;
alter table public.return_requests      enable row level security;
alter table public.complaints           enable row level security;
alter table public.complaint_messages   enable row level security;
alter table public.reviews              enable row level security;
alter table public.product_events       enable row level security;
alter table public.user_product_interest enable row level security;
alter table public.notification_outbox  enable row level security;
alter table public.promo_notification_log enable row level security; -- no policies: service role only

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- shops
create policy shops_select on public.shops for select
  using (status = 'active' or owner_id = auth.uid() or public.is_admin());
create policy shops_insert on public.shops for insert to authenticated with check (public.is_admin());
create policy shops_update on public.shops for update to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy shops_delete on public.shops for delete to authenticated using (public.is_admin());

create policy payout_select on public.shop_payout_details for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy payout_write on public.shop_payout_details for all to authenticated
  using (public.owns_shop(shop_id) or public.is_admin())
  with check (public.owns_shop(shop_id) or public.is_admin());

-- catalogue taxonomy
create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy brands_read  on public.brands for select using (true);
create policy brands_admin on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- products (+ media, variants inherit product visibility)
create policy products_select on public.products for select
  using ((status = 'active' and exists (select 1 from public.shops s where s.id = shop_id and s.status = 'active'))
         or public.owns_shop(shop_id) or public.is_admin());
create policy products_insert on public.products for insert to authenticated
  with check (public.owns_shop(shop_id) or public.is_admin());
create policy products_update on public.products for update to authenticated
  using (public.owns_shop(shop_id) or public.is_admin())
  with check (public.owns_shop(shop_id) or public.is_admin());
create policy products_delete on public.products for delete to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());

create policy media_select on public.product_media for select
  using (exists (select 1 from public.products p where p.id = product_id));
create policy media_write on public.product_media for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (public.owns_shop(p.shop_id) or public.is_admin())))
  with check (exists (select 1 from public.products p where p.id = product_id and (public.owns_shop(p.shop_id) or public.is_admin())));

create policy variants_select on public.product_variants for select
  using (exists (select 1 from public.products p where p.id = product_id));
create policy variants_write on public.product_variants for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (public.owns_shop(p.shop_id) or public.is_admin())))
  with check (exists (select 1 from public.products p where p.id = product_id and (public.owns_shop(p.shop_id) or public.is_admin())));

-- buyer-owned data
create policy addresses_own on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wishlist_own on public.wishlist_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_own on public.cart_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- config
create policy rates_read  on public.delivery_rates for select using (true);
create policy rates_admin on public.delivery_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy settings_read  on public.platform_settings for select using (true);
create policy settings_admin on public.platform_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- campaigns
create policy campaigns_read on public.campaigns for select
  using (is_active or public.is_admin());
create policy campaigns_admin on public.campaigns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ctargets_read on public.campaign_targets for select using (true);
create policy ctargets_admin on public.campaign_targets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- orders / payments: read-only for clients (written by Edge Functions)
create policy orders_select on public.orders for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));

-- packages: buyer, owning shop, assigned rider, admin
create policy packages_select on public.packages for select to authenticated
  using (public.is_admin() or public.owns_shop(shop_id) or rider_id = auth.uid()
         or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy packages_update on public.packages for update to authenticated
  using (public.is_admin() or public.owns_shop(shop_id) or rider_id = auth.uid())
  with check (public.is_admin() or public.owns_shop(shop_id) or rider_id = auth.uid());

create policy items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.packages pk where pk.id = package_id));
create policy history_select on public.package_status_history for select to authenticated
  using (exists (select 1 from public.packages pk where pk.id = package_id));

-- money: shops see their own, admin sees all, writes are service-role only
create policy ledger_select on public.ledger_entries for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy ledger_admin on public.ledger_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy payouts_select on public.payouts for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy payouts_admin on public.payouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- returns
create policy returns_select on public.return_requests for select to authenticated
  using (buyer_id = auth.uid() or public.owns_shop(shop_id) or public.is_admin());
create policy returns_insert on public.return_requests for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and exists (select 1 from public.packages pk
                 where pk.id = package_id and pk.status in ('delivered','completed')));
create policy returns_update on public.return_requests for update to authenticated
  using (buyer_id = auth.uid() or public.owns_shop(shop_id) or public.is_admin())
  with check (buyer_id = auth.uid() or public.owns_shop(shop_id) or public.is_admin());

-- complaints
create policy complaints_select on public.complaints for select to authenticated
  using (created_by = auth.uid() or public.owns_shop(shop_id) or rider_id = auth.uid() or public.is_admin());
create policy complaints_insert on public.complaints for insert to authenticated
  with check (created_by = auth.uid());
create policy complaints_admin_update on public.complaints for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy cmsg_select on public.complaint_messages for select to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id));
create policy cmsg_insert on public.complaint_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.complaints c where c.id = complaint_id));

-- reviews: only for delivered purchases
create policy reviews_read on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and exists (select 1 from public.order_items oi
                 join public.packages pk on pk.id = oi.package_id
                 join public.orders o on o.id = pk.order_id
                where oi.id = order_item_id and o.buyer_id = auth.uid()
                  and pk.status in ('delivered','completed')));

-- tracking: anyone may append events (guests included), nobody can read
-- them back except admin. The app must only send events after consent.
create policy events_insert on public.product_events for insert to anon, authenticated
  with check (device_id is not null and (user_id is null or user_id = auth.uid()));
create policy events_admin_read on public.product_events for select to authenticated
  using (public.is_admin());
create policy interest_own on public.user_product_interest for select to authenticated
  using (user_id = auth.uid());

create policy outbox_admin on public.notification_outbox for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- STORAGE BUCKETS
-- Upload paths: product-media/<shop_id>/<file>, shop-assets/<shop_id>/<file>,
-- return-evidence/<user_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('product-media',   'product-media',   true),
  ('shop-assets',     'shop-assets',     true),
  ('return-evidence', 'return-evidence', false)
on conflict (id) do nothing;

create policy "public read catalogue media" on storage.objects for select
  using (bucket_id in ('product-media','shop-assets'));
create policy "sellers write catalogue media" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-media','shop-assets')
              and (public.is_admin() or public.owns_shop(((storage.foldername(name))[1])::uuid)));
create policy "sellers update catalogue media" on storage.objects for update to authenticated
  using (bucket_id in ('product-media','shop-assets')
         and (public.is_admin() or public.owns_shop(((storage.foldername(name))[1])::uuid)));
create policy "sellers delete catalogue media" on storage.objects for delete to authenticated
  using (bucket_id in ('product-media','shop-assets')
         and (public.is_admin() or public.owns_shop(((storage.foldername(name))[1])::uuid)));
create policy "buyers upload return evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'return-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner or admin read evidence" on storage.objects for select to authenticated
  using (bucket_id = 'return-evidence'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- TODO v1.1: let the shop owner read evidence for returns on their packages.

-- ---------------------------------------------------------------------
-- REALTIME (live order status in the app)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.packages;

-- ---------------------------------------------------------------------
-- SCHEDULED JOBS - enable the pg_cron extension (Database > Extensions)
-- then uncomment:
--
-- select cron.schedule('refresh-interest',  '*/30 * * * *', 'select public.refresh_user_interest()');
-- select cron.schedule('release-earnings',  '0 * * * *',    'select public.release_due_earnings()');
-- select cron.schedule('expire-unpaid',     '*/10 * * * *', 'select public.expire_unpaid_orders(30)');
--
-- FIRST ADMIN: sign up in the app, then in the SQL editor run:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- ---------------------------------------------------------------------
