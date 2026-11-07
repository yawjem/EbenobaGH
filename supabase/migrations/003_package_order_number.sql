-- Riders and sellers cannot read the orders table (by design), so they could not see
-- the order number. Store it on each package so the rider site, seller portal and admin
-- can all search and mark statuses by order number.

alter table public.packages add column if not exists order_number text;

update public.packages p
   set order_number = o.order_number
  from public.orders o
 where o.id = p.order_id and p.order_number is null;

create or replace function public.packages_set_order_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_number is null then
    select order_number into new.order_number from public.orders where id = new.order_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_packages_order_number on public.packages;
create trigger trg_packages_order_number before insert on public.packages
  for each row execute function public.packages_set_order_number();

create index if not exists packages_order_number_idx on public.packages (order_number);

-- Make the order number immutable for non-admins (it is part of the financial/identity record).
create or replace function public.guard_package_order_number() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.order_number is distinct from old.order_number then
    raise exception 'order_number is read-only';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_package_order_number on public.packages;
create trigger trg_guard_package_order_number before update on public.packages
  for each row execute function public.guard_package_order_number();
