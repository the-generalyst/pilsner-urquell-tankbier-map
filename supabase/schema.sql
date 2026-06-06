-- ═══════════════════════════════════════════════════════════════════════════
-- Tankové Pivo Map — shared database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates the tables and the security rules that let the website read and
-- write anonymously (no login), while keeping things sane.
-- Running it again is safe (it uses "if not exists" / "drop policy if exists").
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Community-added bars ------------------------------------------------------
create table if not exists public.bars (
  id           text primary key,
  name         text not null,
  city         text not null,
  country      text,
  neighborhood text,
  lat          double precision not null,
  lng          double precision not null,
  type         text,
  beers        jsonb default '[]'::jsonb,
  note         text,
  website      text,
  created_at   timestamptz default now()
);

-- 2) Prices + star ratings ----------------------------------------------------
create table if not exists public.reviews (
  id         bigint generated always as identity primary key,
  bar_id     text not null,
  price      numeric,
  size       numeric default 0.5,
  rating     int,
  note       text,
  created_at timestamptz default now(),
  constraint rating_range check (rating is null or (rating between 1 and 5)),
  constraint price_range  check (price  is null or (price >= 0 and price <= 100))
);
create index if not exists reviews_bar_id_idx on public.reviews (bar_id);

-- 3) Community reports of which beers a bar serves -----------------------------
create table if not exists public.beer_reports (
  id         bigint generated always as identity primary key,
  bar_id     text not null,
  brand_id   text not null,
  created_at timestamptz default now()
);
create index if not exists beer_reports_bar_id_idx on public.beer_reports (bar_id);

-- 4) Security rules (Row Level Security) --------------------------------------
-- Allow anyone (anonymous visitors) to READ everything and ADD new rows.
-- Nobody can edit or delete existing rows through the public key.
alter table public.bars         enable row level security;
alter table public.reviews      enable row level security;
alter table public.beer_reports enable row level security;

drop policy if exists "public read bars"          on public.bars;
drop policy if exists "public insert bars"        on public.bars;
drop policy if exists "public read reviews"       on public.reviews;
drop policy if exists "public insert reviews"     on public.reviews;
drop policy if exists "public read beer_reports"  on public.beer_reports;
drop policy if exists "public insert beer_reports" on public.beer_reports;

create policy "public read bars"           on public.bars         for select using (true);
create policy "public insert bars"         on public.bars         for insert with check (true);
create policy "public read reviews"        on public.reviews      for select using (true);
create policy "public insert reviews"      on public.reviews      for insert with check (true);
create policy "public read beer_reports"   on public.beer_reports for select using (true);
create policy "public insert beer_reports" on public.beer_reports for insert with check (true);

-- Done. Your map can now read & write shared data with just the anon key.
