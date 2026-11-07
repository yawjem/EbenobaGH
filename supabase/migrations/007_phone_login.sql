-- Phone-number login support. Run after 006.
-- Supabase stores a phone user's number as digits without "+" (233244123456). Profiles keep numbers as +233...
-- and profiles.phone is UNIQUE, so a clash (the same number already saved on another account) must never make
-- sign-up fail: in that case the new profile simply starts without a phone.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := null;
begin
  if nullif(new.phone, '') is not null then
    v_phone := '+' || regexp_replace(new.phone, '[^0-9]', '', 'g');
    if exists (select 1 from public.profiles where phone = v_phone) then v_phone := null; end if;
  end if;
  insert into public.profiles (id, email, phone, full_name)
  values (new.id, new.email, v_phone, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
