-- CartBully schema. Run once per fresh Supabase project.
-- Safe to re-run: uses IF NOT EXISTS and permissive drops where marked.

create extension if not exists pgcrypto;

-- profiles: any authenticated user (Supabase auth.users) gets a row on demand.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now()
);

-- verdicts: the canonical record of every beatdown.
create table if not exists verdicts (
  id text primary key,
  user_or_anon_key text not null,
  url text not null,
  title text not null,
  price numeric(10,2) not null,
  image text,
  domain text not null,
  verdict text not null check (verdict in ('TRASHED','SPARED')),
  grade text not null check (grade in ('A','B+','B','C','D','F')),
  roast text not null,
  math jsonb not null,
  swap jsonb,
  meanness text not null default 'medium',
  category text default 'misc',
  shareable boolean not null default true,
  outcome text not null default 'unconfirmed' check (outcome in ('unconfirmed','walked_away','took_swap','bought_anyway')),
  outcome_at timestamptz,
  card_line text,
  created_at timestamptz not null default now()
);
create index if not exists verdicts_user_key_idx on verdicts (user_or_anon_key, created_at desc);
create index if not exists verdicts_url_meanness_idx on verdicts (url, meanness, created_at desc);
create index if not exists verdicts_shareable_idx on verdicts (shareable, created_at desc);

-- lockers: TRASHED items being price-watched.
create table if not exists lockers (
  id uuid primary key default gen_random_uuid(),
  verdict_id text not null references verdicts(id) on delete cascade,
  user_or_anon_key text not null,
  status text not null default 'watching' check (status in ('watching','released','dismissed')),
  last_price numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lockers_user_idx on lockers (user_or_anon_key, status);

-- detentions: 48h cooldown on considered items.
create table if not exists detentions (
  id uuid primary key default gen_random_uuid(),
  verdict_id text not null references verdicts(id) on delete cascade,
  user_or_anon_key text not null,
  release_at timestamptz not null,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists detentions_user_release_idx on detentions (user_or_anon_key, release_at);

-- price_snapshots: history for the price-watch cron.
create table if not exists price_snapshots (
  id uuid primary key default gen_random_uuid(),
  verdict_id text not null references verdicts(id) on delete cascade,
  price numeric(10,2) not null,
  captured_at timestamptz not null default now()
);
create index if not exists price_snapshots_verdict_idx on price_snapshots (verdict_id, captured_at desc);

-- alerts_sent: dedupe locker drop emails.
create table if not exists alerts_sent (
  id uuid primary key default gen_random_uuid(),
  verdict_id text not null references verdicts(id) on delete cascade,
  price numeric(10,2) not null,
  sent_at timestamptz not null default now()
);
create index if not exists alerts_sent_verdict_idx on alerts_sent (verdict_id, sent_at desc);

-- subscribers: Stripe subscription mirror.
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  stripe_customer_id text unique not null,
  stripe_subscription_id text,
  status text not null,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists subscribers_email_idx on subscribers (email);
create index if not exists subscribers_status_idx on subscribers (status);

-- events: lightweight analytics log.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_idx on events (name, created_at desc);

-- RLS
alter table profiles enable row level security;
alter table verdicts enable row level security;
alter table lockers enable row level security;
alter table detentions enable row level security;
alter table price_snapshots enable row level security;
alter table alerts_sent enable row level security;
alter table subscribers enable row level security;
alter table events enable row level security;

-- Public read of shareable verdicts so /b/[id] works for anyone.
drop policy if exists "verdicts public read" on verdicts;
create policy "verdicts public read" on verdicts
  for select using (shareable = true);

-- Authenticated users can read their own verdicts by user_or_anon_key = 'user:<uid>'.
drop policy if exists "verdicts user read" on verdicts;
create policy "verdicts user read" on verdicts
  for select using (auth.uid()::text is not null and user_or_anon_key = 'user:' || auth.uid()::text);

-- Users manage their own lockers / detentions.
drop policy if exists "lockers user rw" on lockers;
create policy "lockers user rw" on lockers
  for all using (auth.uid()::text is not null and user_or_anon_key = 'user:' || auth.uid()::text);

drop policy if exists "detentions user rw" on detentions;
create policy "detentions user rw" on detentions
  for all using (auth.uid()::text is not null and user_or_anon_key = 'user:' || auth.uid()::text);

drop policy if exists "subscribers user read" on subscribers;
create policy "subscribers user read" on subscribers
  for select using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "profiles owner rw" on profiles;
create policy "profiles owner rw" on profiles
  for all using (auth.uid() = id);

-- service role bypasses RLS via SUPABASE_SERVICE_ROLE_KEY, no policy needed.
