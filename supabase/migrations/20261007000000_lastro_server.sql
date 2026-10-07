-- Lastro server schema: accounts, plans/orders, affiliates, attribution and the Centralis
-- integration (outbox, received actions). Lives in its own schema so Supabase's public
-- REST API never exposes it; RLS is enabled with no policies as a second lock.
--
-- Apply on Supabase:  supabase db push   (or paste into the SQL editor)
-- Local dev/tests run this same file against an embedded Postgres (PGlite).

create schema if not exists lastro;

-- ---------------------------------------------------------------------------------------
-- Plans and accounts
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.plans (
  id            text primary key,
  name          text not null,
  amount_minor  integer not null check (amount_minor >= 0),
  currency      text not null default 'BRL',
  billing       text not null check (billing in ('one_time', 'monthly')),
  active        boolean not null default true
);

insert into lastro.plans (id, name, amount_minor, currency, billing) values
  ('mensal', 'Mensal', 1990, 'BRL', 'monthly'),
  ('vitalicio', 'Vitalício', 9990, 'BRL', 'one_time')
on conflict (id) do nothing;

create table if not exists lastro.users (
  id                   text primary key,
  name                 text not null,
  email                text unique,            -- lowercase
  phone                text unique,            -- E.164, e.g. +5511987654321
  password_hash        text not null,
  password_salt        text not null,
  password_iterations  integer not null,
  status               text not null default 'active' check (status in ('active', 'suspended', 'deactivated')),
  plan_id              text references lastro.plans (id),
  subscription_status  text check (subscription_status in ('active', 'past_due', 'cancelled')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index if not exists users_name_lower_idx on lastro.users (lower(name));

create table if not exists lastro.sessions (
  id            text primary key,              -- sha256 of the cookie token; the token itself is never stored
  user_id       text not null references lastro.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists sessions_user_idx on lastro.sessions (user_id);

-- ---------------------------------------------------------------------------------------
-- Visitors, sessions, affiliates, clicks, attribution
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.visitors (
  id             uuid primary key,
  user_id        text references lastro.users (id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);
create index if not exists visitors_user_idx on lastro.visitors (user_id);

create table if not exists lastro.visitor_sessions (
  id            uuid primary key,
  visitor_id    uuid not null references lastro.visitors (id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists lastro.affiliates (
  id                          uuid primary key,
  user_id                     text not null unique references lastro.users (id),
  centralis_affiliate_id      text not null unique,
  code                        text not null unique,        -- uppercase
  commission_rate_reference   numeric(6, 4),                -- display only; Centralis computes commissions
  attribution_window_days     integer not null default 30 check (attribution_window_days between 1 and 365),
  status                      text not null check (status in ('active', 'suspended', 'disabled')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- The affiliate a user was attributed to when they signed up (signup funnel step).
alter table lastro.users add column if not exists referred_by_affiliate_id uuid references lastro.affiliates (id);

create table if not exists lastro.affiliate_clicks (
  id              uuid primary key,
  affiliate_id    uuid not null references lastro.affiliates (id),
  affiliate_code  text not null,
  visitor_id      uuid not null references lastro.visitors (id),
  session_id      uuid not null references lastro.visitor_sessions (id),
  landing_page    text,
  referrer        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_term        text,
  utm_content     text,
  created_at      timestamptz not null default now(),
  unique (affiliate_id, session_id)          -- a refresh in the same session is not a new click
);
create index if not exists affiliate_clicks_affiliate_idx on lastro.affiliate_clicks (affiliate_id);

create table if not exists lastro.attributions (
  id             uuid primary key,
  visitor_id     uuid not null references lastro.visitors (id),
  user_id        text references lastro.users (id),
  affiliate_id   uuid not null references lastro.affiliates (id),
  click_id       uuid not null references lastro.affiliate_clicks (id),
  attributed_at  timestamptz not null,
  expires_at     timestamptz not null
);
create index if not exists attributions_visitor_idx on lastro.attributions (visitor_id, attributed_at desc);
create index if not exists attributions_user_idx on lastro.attributions (user_id, attributed_at desc);
create index if not exists attributions_affiliate_idx on lastro.attributions (affiliate_id);

-- Dashboard projection sent by Centralis (commission figures). Not an accounting source.
create table if not exists lastro.affiliate_stats (
  affiliate_id                uuid primary key references lastro.affiliates (id),
  commission_generated_minor  integer,
  pending_commission_minor    integer,
  paid_commission_minor       integer,
  currency                    text not null default 'BRL',
  synced_at                   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------
-- Orders, charges, subscriptions — confirmed only by the payment gateway
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.orders (
  id                     uuid primary key,
  user_id                text not null references lastro.users (id),
  plan_id                text not null references lastro.plans (id),
  amount_minor           integer not null,
  currency               text not null,
  status                 text not null check (status in ('pending', 'approved', 'refunded', 'failed', 'cancelled')),
  provider               text not null,
  provider_checkout_id   text,
  visitor_id             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists orders_user_idx on lastro.orders (user_id);

create table if not exists lastro.subscriptions (
  id                         uuid primary key,
  user_id                    text not null references lastro.users (id),
  plan_id                    text not null references lastro.plans (id),
  order_id                   uuid references lastro.orders (id),
  provider                   text not null,
  provider_subscription_id   text not null,
  status                     text not null check (status in ('active', 'past_due', 'cancelled')),
  current_period_end         timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

-- One row per money movement the gateway confirmed. The unique transaction id is what makes
-- a duplicated webhook produce a single purchase.
create table if not exists lastro.charges (
  id                       uuid primary key,
  order_id                 uuid not null references lastro.orders (id),
  subscription_id          uuid references lastro.subscriptions (id),
  provider                 text not null,
  gateway_transaction_id   text not null,
  kind                     text not null check (kind in ('initial', 'renewal')),
  amount_minor             integer not null,
  currency                 text not null,
  status                   text not null check (status in ('approved', 'refunded')),
  affiliate_id             uuid references lastro.affiliates (id),   -- attribution snapshot at payment time
  affiliate_code           text,
  paid_at                  timestamptz not null,
  refunded_at              timestamptz,
  unique (provider, gateway_transaction_id)
);
create index if not exists charges_affiliate_idx on lastro.charges (affiliate_id);

create table if not exists lastro.processed_webhooks (
  provider           text not null,
  provider_event_id  text not null,
  received_at        timestamptz not null default now(),
  primary key (provider, provider_event_id)
);

-- ---------------------------------------------------------------------------------------
-- Centralis integration
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.centralis_outbox (
  id              uuid primary key,
  event_id        uuid not null unique,
  event_type      text not null,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts        integer not null default 0,
  next_retry_at   timestamptz not null default now(),
  last_error      text,
  locked_at       timestamptz,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists centralis_outbox_due_idx on lastro.centralis_outbox (status, next_retry_at);

-- Every command received from Centralis: idempotency key + local audit trail.
create table if not exists lastro.centralis_actions (
  action_id         uuid primary key,
  action            text not null,
  payload_sha256    text not null,
  external_user_id  text,
  status            text not null check (status in ('applied', 'rejected')),
  response          jsonb not null,
  received_at       timestamptz not null default now()
);

create table if not exists lastro.integration_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Second lock: even if the schema were exposed, anon/authenticated roles get nothing.
alter table lastro.plans enable row level security;
alter table lastro.users enable row level security;
alter table lastro.sessions enable row level security;
alter table lastro.visitors enable row level security;
alter table lastro.visitor_sessions enable row level security;
alter table lastro.affiliates enable row level security;
alter table lastro.affiliate_clicks enable row level security;
alter table lastro.attributions enable row level security;
alter table lastro.affiliate_stats enable row level security;
alter table lastro.orders enable row level security;
alter table lastro.subscriptions enable row level security;
alter table lastro.charges enable row level security;
alter table lastro.processed_webhooks enable row level security;
alter table lastro.centralis_outbox enable row level security;
alter table lastro.centralis_actions enable row level security;
alter table lastro.integration_state enable row level security;
