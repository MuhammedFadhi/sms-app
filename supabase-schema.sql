-- ================================================================
--  SA'DA H2O SMS Platform — Supabase Schema
--  Run this in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Profiles (extends Supabase auth.users) ─────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text    not null default '',
  role        text    not null default 'staff' check (role in ('admin','staff')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Contact types (editable from the Contacts page) ───────────
create table if not exists public.contact_types (
  name        text primary key,
  created_at  timestamptz not null default now()
);
insert into public.contact_types (name, created_at) values
  ('Customer', now()),
  ('Lead',     now() + interval '1 second'),
  ('VIP',      now() + interval '2 seconds'),
  ('Prospect', now() + interval '3 seconds')
on conflict do nothing;

-- ── Contacts ───────────────────────────────────────────────────
create table if not exists public.contacts (
  id          uuid primary key default uuid_generate_v4(),
  name        text    not null default '',
  mobile      text    not null,
  city        text    not null default '',
  type        text    not null default 'Lead' references public.contact_types(name) on update cascade,
  notes       text    not null default '',
  opt_out     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint contacts_mobile_type_key unique (mobile, type)
);
create index if not exists idx_contacts_mobile  on public.contacts(mobile);
create index if not exists idx_contacts_type    on public.contacts(type);
create index if not exists idx_contacts_opt_out on public.contacts(opt_out);

-- ── Templates ──────────────────────────────────────────────────
create table if not exists public.templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text    not null,
  category    text    not null default 'Custom' check (category in ('Seasonal','Product','Promotional','Follow-up','Custom')),
  lang        text    not null default 'both'   check (lang in ('both','ar','en')),
  body_ar     text    not null default '',
  body_en     text    not null default '',
  created_by  text    not null default 'system',
  created_at  timestamptz not null default now()
);

-- ── Campaigns ──────────────────────────────────────────────────
create table if not exists public.campaigns (
  id          uuid primary key default uuid_generate_v4(),
  name        text    not null,
  template_id uuid    references public.templates(id) on delete set null,
  list_filter text    not null default 'all',
  lang        text    not null default 'both',
  total       integer not null default 0,
  delivered   integer not null default 0,
  failed      integer not null default 0,
  cost        numeric(10,2) not null default 0,
  created_by  text    not null default '',
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- ── Send logs ──────────────────────────────────────────────────
create table if not exists public.send_logs (
  id          uuid primary key default uuid_generate_v4(),
  campaign_id uuid    not null references public.campaigns(id) on delete cascade,
  contact_id  uuid,
  mobile      text    not null,
  name        text    not null default '',
  status      text    not null check (status in ('delivered','failed','error')),
  taqnyat_id  text    not null default '',
  sent_at     timestamptz not null default now()
);
create index if not exists idx_logs_campaign on public.send_logs(campaign_id);

-- ================================================================
--  Row Level Security
-- ================================================================

-- Profiles
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Contact types
alter table public.contact_types enable row level security;
create policy "types_select" on public.contact_types for select to authenticated using (true);
create policy "types_insert" on public.contact_types for insert to authenticated with check (true);
create policy "types_delete" on public.contact_types for delete to authenticated using (true);

-- Contacts
alter table public.contacts enable row level security;
create policy "contacts_select" on public.contacts for select to authenticated using (true);
create policy "contacts_insert" on public.contacts for insert to authenticated with check (true);
create policy "contacts_update" on public.contacts for update to authenticated using (true) with check (true);
create policy "contacts_delete" on public.contacts for delete to authenticated using (true);

-- Templates
alter table public.templates enable row level security;
create policy "templates_select" on public.templates for select to authenticated using (true);
create policy "templates_insert" on public.templates for insert to authenticated with check (true);
create policy "templates_update" on public.templates for update to authenticated using (true) with check (true);
create policy "templates_delete" on public.templates for delete to authenticated using (true);

-- Campaigns
alter table public.campaigns enable row level security;
create policy "campaigns_select" on public.campaigns for select to authenticated using (true);
create policy "campaigns_insert" on public.campaigns for insert to authenticated with check (true);
create policy "campaigns_update" on public.campaigns for update to authenticated using (true) with check (true);
create policy "campaigns_delete" on public.campaigns for delete to authenticated using (true);

-- Send logs
alter table public.send_logs enable row level security;
create policy "logs_select" on public.send_logs for select to authenticated using (true);
create policy "logs_insert" on public.send_logs for insert to authenticated with check (true);

-- ================================================================
--  Seed: 10 SA'DA H2O templates
-- ================================================================
insert into public.templates (name, category, lang, body_ar, body_en, created_by) values
  ('Eid Al-Fitr greeting',       'Seasonal',    'both', 'عيد مبارك وكل عام وأنتم بخير! يتمنى لكم فريق SA''DA H2O وأسركم صحةً وسعادةً. للتواصل: 920000000', 'Eid Mubarak! SA''DA H2O wishes you and your family joy and good health. Contact: 920000000', 'system'),
  ('Eid Al-Adha greeting',       'Seasonal',    'both', 'بمناسبة عيد الأضحى المبارك، يهنئكم فريق SA''DA H2O ويتمنى لكم البركة والسعادة. للتواصل: 920000000', 'Eid Al-Adha Mubarak from SA''DA H2O! Wishing you blessings and joy. Contact: 920000000', 'system'),
  ('Saudi National Day',         'Seasonal',    'both', 'بمناسبة اليوم الوطني السعودي الـ95، يشاركم فريق SA''DA H2O فرحة الوطن. عاشت المملكة. للتواصل: 920000000', 'Happy Saudi National Day! SA''DA H2O is proud to serve the Kingdom. Contact: 920000000', 'system'),
  ('Saudi Founding Day',         'Seasonal',    'both', 'في يوم التأسيس نفخر بانتمائنا لهذا الوطن العظيم. كل عام والمملكة بخير من SA''DA H2O. للتواصل: 920000000', 'Happy Saudi Founding Day! SA''DA H2O celebrates with you. Contact: 920000000', 'system'),
  ('Ramadan Kareem',             'Seasonal',    'both', 'رمضان كريم! يتمنى فريق SA''DA H2O شهراً مباركاً. ماء نقي لصيام صحي. للتواصل: 920000000', 'Ramadan Kareem from SA''DA H2O! Pure water for a healthy fast. Contact: 920000000', 'system'),
  ('RO system promo',            'Product',     'both', 'احصل على نظام تنقية المياه العكسي من SA''DA H2O بأفضل الأسعار. جودة لا مثيل لها. اتصل: 920000000', 'Upgrade your water with SA''DA H2O RO systems. Best prices, unmatched quality. Call: 920000000', 'system'),
  ('Maintenance plan offer',     'Product',     'both', 'خطط صيانة SA''DA H2O تضمن لك مياهاً نقية طوال العام. اشترك الآن بأسعار حصرية. اتصل: 920000000', 'SA''DA H2O maintenance plans keep your water pure year-round. Exclusive rates. Call: 920000000', 'system'),
  ('New customer welcome',       'Promotional', 'both', 'أهلاً بكم في عائلة SA''DA H2O! نحن سعداء بخدمتكم وتقديم أفضل حلول تنقية المياه. للدعم: 920000000', 'Welcome to SA''DA H2O! We''re delighted to serve you with the best water purification. Support: 920000000', 'system'),
  ('Special discount offer',     'Promotional', 'both', 'عرض خاص: خصم 15% على جميع أجهزة تنقية SA''DA H2O هذا الشهر فقط. اطلب الآن: 920000000', 'SA''DA H2O Special: 15% off all purification systems this month only. Order: 920000000', 'system'),
  ('Filter replacement reminder','Follow-up',   'both', 'تذكير من SA''DA H2O: حان وقت تغيير فلتر مياهك لضمان نقاء مثالي وصحة أفضل. احجز: 920000000', 'Reminder from SA''DA H2O: Time to replace your filter for optimal purity. Book: 920000000', 'system')
on conflict do nothing;

select 'Schema setup complete. ' || count(*) || ' templates seeded.' as result from public.templates;
