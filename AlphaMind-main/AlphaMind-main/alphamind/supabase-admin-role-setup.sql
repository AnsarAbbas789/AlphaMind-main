-- =====================================================================
-- AlphaMind — Admin Role Setup (Part A, Point 3)
-- =====================================================================
-- یہ پوری فائل Supabase Dashboard → SQL Editor → New Query میں پیسٹ
-- کر کے "Run" کریں۔ اوپر سے نیچے تک ایک ہی بار میں چلے گی۔
--
-- یہ کیا کرتی ہے:
--   1) "profiles" ٹیبل بناتی ہے (اگر پہلے سے نہ ہو) جس میں ہر یوزر
--      کا role ("user" یا "admin") محفوظ ہوتا ہے۔
--   2) نیا اکاؤنٹ بننے پر خودکار طور پر profiles میں ایک row بناتی
--      ہے، role ہمیشہ "user" سے شروع ہوتا ہے (کبھی بھی خودکار admin
--      نہیں بنتا)۔
--   3) Row Level Security (RLS) فعال کرتی ہے تاکہ:
--        - ہر یوزر صرف اپنی پروفائل دیکھ/اپڈیٹ کر سکے
--        - صرف ایڈمن سب کی پروفائلز دیکھ سکے
--        - کوئی بھی عام یوزر خود کو "admin" نہ بنا سکے
--          (چاہے وہ براؤزر DevTools سے کوشش کرے)
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1) PROFILES ٹیبل
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

-- اگر ٹیبل پہلے سے موجود تھا مگر role column نہیں تھا، تو یہ اسے شامل کر دے گی
alter table public.profiles
  add column if not exists role text not null default 'user';

-- role کالم پر پرانا/نیا constraint یقینی بنائیں (صرف 'user' یا 'admin')
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user','admin'));
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 2) is_admin() ہیلپر فنکشن
-- ─────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER کی وجہ سے یہ فنکشن RLS کو bypass کر کے چیک کرتا ہے
-- کہ دیا گیا uuid ایڈمن ہے یا نہیں — بغیر infinite-recursion مسئلے کے
-- (جو ورنہ profiles ٹیبل کی پالیسی کے اندر خود profiles ٹیبل پڑھنے
-- سے پیدا ہو سکتا ہے)۔
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 3) نیا اکاؤنٹ بننے پر خودکار profile row بنانا
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────
-- 4) کسی یوزر کو خود اپنا role تبدیل کرنے سے روکنا
-- ─────────────────────────────────────────────────────────────────────
-- یہ trigger یقینی بناتا ہے کہ role کالم صرف موجودہ ایڈمن ہی بدل سکے۔
-- عام یوزر اپنا نام (full_name) اپڈیٹ کر سکتا ہے، لیکن role کبھی نہیں —
-- چاہے وہ براہ راست Supabase client سے UPDATE بھیجنے کی کوشش کرے۔
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin(auth.uid()) then
      raise exception 'صرف ایڈمن ہی role تبدیل کر سکتا ہے / Only an admin can change roles.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();


-- ─────────────────────────────────────────────────────────────────────
-- 5) Row Level Security فعال کرنا + پالیسیاں
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- پرانی پالیسیاں (اگر دوبارہ رن کریں تو) صاف کر دیں تاکہ ڈپلیکیٹ نہ بنیں
drop policy if exists "Users can view own profile"    on public.profiles;
drop policy if exists "Admins can view all profiles"   on public.profiles;
drop policy if exists "Users can update own profile"   on public.profiles;

-- ہر یوزر صرف اپنی پروفائل پڑھ سکے
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- ایڈمن سب کی پروفائلز پڑھ سکے (Admin Panel یوزر لسٹ کے لیے مستقبل میں کارآمد)
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

-- ہر یوزر اپنی پروفائل اپڈیٹ کر سکے (role کی حفاظت اوپر والا trigger کرتا ہے)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────────────
-- 6) اپنے آپ کو پہلا ایڈمن بنائیں (صرف ایک بار چلائیں)
-- ─────────────────────────────────────────────────────────────────────
-- نیچے 'YOUR_EMAIL_HERE' کی جگہ اپنی وہ ای میل لکھیں جس سے آپ نے
-- AlphaMind میں سائن اپ کیا تھا، پھر صرف یہی ایک لائن الگ سے
-- SQL Editor میں دوبارہ چلائیں (اوپر کے سب کچھ کے بعد، الگ query کے طور پر):
--
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
--
-- تصدیق کے لیے:
-- select id, full_name, role from public.profiles;