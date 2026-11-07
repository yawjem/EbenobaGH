-- Delivery PIN: each package gets a 4-digit code that only the buyer can see.
-- Our own riders can mark "delivered" only by entering that code (confirm_delivery).
-- Third-party couriers and pickups are unchanged: the admin marks those delivered by hand.
-- Run after 005.

create table public.package_pins (
  package_id uuid primary key references public.packages(id) on delete cascade,
  pin text not null check (pin ~ '^[0-9]{4}$'),
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.package_pins enable row level security;
-- Readable by the buyer of that package and by admins. Riders and sellers get nothing.
-- No insert/update/delete policies: only the functions below write to it.
create policy pins_select on public.package_pins for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.packages pk join public.orders o on o.id = pk.order_id
     where pk.id = package_id and o.buyer_id = auth.uid()));

create function public.new_pin() returns text language sql volatile as $$
  -- gen_random_uuid() is a secure random source; 7 hex digits = 28 bits, reduced to 4 decimal digits
  select lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int % 10000)::text, 4, '0')
$$;

create function public.create_package_pin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.package_pins (package_id, pin) values (new.id, public.new_pin()) on conflict do nothing;
  return new;
end $$;
create trigger trg_package_pin after insert on public.packages
  for each row execute function public.create_package_pin();

-- Packages that already exist and are not finished get a code too
insert into public.package_pins (package_id, pin)
select id, public.new_pin() from public.packages
 where status not in ('delivered','completed','cancelled','returned','refunded')
on conflict do nothing;

-- Guard: riders may no longer set "delivered" with a plain update. confirm_delivery() flips a
-- transaction-local flag after the code checks out. (Same function as before plus that one rule.)
create or replace function public.guard_package_update() returns trigger
language plpgsql set search_path = public as $$
begin
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
        if new.status = 'delivered' then
          if coalesce(current_setting('app.pin_ok', true), '') <> new.id::text then
            raise exception 'Delivery must be confirmed with the customer''s code';
          end if;
        elsif new.status <> 'in_transit' then
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

-- Rider enters the code the customer reads out.
-- A wrong code is an ordinary result (not an exception) so the attempt counter is saved.
create function public.confirm_delivery(p_package uuid, p_pin text, p_received_by text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pk public.packages; v public.package_pins; c_max constant int := 5;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into pk from public.packages where id = p_package for update;
  if not found or pk.rider_id is distinct from auth.uid() then raise exception 'not_your_package'; end if;
  if pk.status not in ('assigned','dispatched','in_transit') then raise exception 'wrong_status'; end if;
  if coalesce(trim(p_received_by),'') = '' then raise exception 'receiver_required'; end if;

  select * into v from public.package_pins where package_id = p_package for update;
  if not found then raise exception 'no_pin'; end if;
  if v.attempts >= c_max then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;

  if trim(coalesce(p_pin,'')) <> v.pin then
    update public.package_pins set attempts = attempts + 1 where package_id = p_package;
    return jsonb_build_object('ok', false, 'reason', case when v.attempts + 1 >= c_max then 'locked' else 'wrong_pin' end,
                              'attempts_left', greatest(c_max - v.attempts - 1, 0));
  end if;

  perform set_config('app.pin_ok', p_package::text, true);   -- transaction-local
  update public.packages set status = 'delivered', delivered_to_name = trim(p_received_by) where id = p_package;
  perform set_config('app.pin_ok', '', true);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.confirm_delivery(uuid,text,text) from public, anon;
grant execute on function public.confirm_delivery(uuid,text,text) to authenticated;

-- Admin: customer lost the code, or the rider got locked out. Issues a fresh code and unlocks.
create function public.admin_reset_delivery_pin(p_package uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_pin text := public.new_pin();
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  insert into public.package_pins (package_id, pin, attempts) values (p_package, v_pin, 0)
  on conflict (package_id) do update set pin = excluded.pin, attempts = 0;
  return v_pin;
end $$;
revoke execute on function public.admin_reset_delivery_pin(uuid) from public, anon;
grant execute on function public.admin_reset_delivery_pin(uuid) to authenticated;

-- The "on its way" message carries the code for our own riders (the SMS is how many customers will see it).
create or replace function public.on_package_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_buyer uuid; v_order_no text; v_shop text; v_pin text;
begin
  if tg_op = 'INSERT' then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());

    if new.status = 'delivered' then
      update public.ledger_entries
         set available_at = new.payout_release_at
       where package_id = new.id and status = 'pending' and entry_type = 'sale_earning';
    end if;

    if new.status in ('paid','ready','dispatched','in_transit','awaiting_pickup','delivered','cancelled') then
      select o.buyer_id, o.order_number into v_buyer, v_order_no
        from public.orders o where o.id = new.order_id;
      select name into v_shop from public.shops where id = new.shop_id;
      if new.status = 'in_transit' and new.delivery_method = 'rider' then
        select pin into v_pin from public.package_pins where package_id = new.id;
      end if;
      insert into public.notification_outbox (user_id, kind, payload)
      values (v_buyer, 'package_' || new.status::text, jsonb_build_object(
        'package_id', new.id, 'order_id', new.order_id, 'order_number', v_order_no,
        'shop_name', v_shop, 'courier_name', new.courier_name,
        'tracking_number', new.tracking_number, 'delivery_method', new.delivery_method,
        'pin', v_pin));
    end if;
  end if;
  return new;
end $$;
