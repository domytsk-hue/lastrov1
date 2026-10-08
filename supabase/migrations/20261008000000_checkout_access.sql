-- Checkout, plan access and payment reconciliation. ADDITIVE ONLY: no table or column is
-- dropped, no row is deleted or rewritten. Safe to run more than once.
--
--   orders               + payment method, purpose (new / upgrade), idempotency key,
--                          attribution snapshot, provider payment id, expiry, instructions
--   access_entitlements  what a user may use, and until when — one row per paid charge
--                          (or per administrative grant). Access is computed from these rows
--                          at request time; nothing on the client can create one.
--   payment_reviews      payments that need a person or a retry: amount/currency/plan mismatch,
--                          duplicate purchases, renewals still to be cancelled after an upgrade,
--                          gateway events Lastro doesn't recognize
--   users                + checkout_deferred_at ("Pagar depois": navigation only, never access)
--   subscriptions        + cancel_at_period_end, current_period_start
--
-- Apply on Supabase (SQL editor or `supabase db push`) BEFORE deploying the code that uses it.

-- ---------------------------------------------------------------------------------------
-- Orders: what is being bought, frozen at checkout
-- ---------------------------------------------------------------------------------------

alter table lastro.orders add column if not exists payment_method text check (payment_method in ('pix', 'card'));
alter table lastro.orders add column if not exists purpose text not null default 'new' check (purpose in ('new', 'upgrade'));
alter table lastro.orders add column if not exists idempotency_key text;
alter table lastro.orders add column if not exists affiliate_id uuid references lastro.affiliates (id);  -- attribution snapshot at checkout
alter table lastro.orders add column if not exists affiliate_code text;
alter table lastro.orders add column if not exists provider_payment_id text;
alter table lastro.orders add column if not exists payment_instructions jsonb;   -- what the gateway returned for the buyer (Pix code, redirect); no card data
alter table lastro.orders add column if not exists expires_at timestamptz;
alter table lastro.orders add column if not exists status_reason text;

-- 'expired' joins the order states (a Pix that was never paid). Same constraint name the
-- first migration generated; existing rows all satisfy the wider check.
alter table lastro.orders drop constraint if exists orders_status_check;
alter table lastro.orders add constraint orders_status_check
  check (status in ('pending', 'approved', 'refunded', 'failed', 'cancelled', 'expired'));

-- A double click, a refresh or a retry with the same key is the same order.
create unique index if not exists orders_user_idempotency_idx on lastro.orders (user_id, idempotency_key) where idempotency_key is not null;
-- Two tabs can't open two charges: at most one pending order per user.
create unique index if not exists orders_one_pending_per_user_idx on lastro.orders (user_id) where status = 'pending';

-- ---------------------------------------------------------------------------------------
-- Subscriptions (only when a gateway supports recurring charges)
-- ---------------------------------------------------------------------------------------

alter table lastro.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table lastro.subscriptions add column if not exists current_period_start timestamptz;

-- ---------------------------------------------------------------------------------------
-- Access entitlements
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.access_entitlements (
  id              uuid primary key,
  user_id         text not null references lastro.users (id),
  plan_id         text references lastro.plans (id),          -- null only for an administrative grant without a plan
  source          text not null check (source in ('purchase', 'renewal', 'admin')),
  charge_id       uuid unique references lastro.charges (id),  -- one entitlement per paid charge, ever
  starts_at       timestamptz not null,
  ends_at         timestamptz,                                 -- null = no end (lifetime, or an open-ended grant)
  status          text not null default 'active' check (status in ('active', 'revoked')),
  revoked_reason  text,
  revoked_at      timestamptz,
  note            text,                                        -- why an administrative grant exists
  created_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (source = 'admin' or charge_id is not null)
);
create index if not exists access_entitlements_user_idx on lastro.access_entitlements (user_id, status);

-- ---------------------------------------------------------------------------------------
-- Payment reviews: never resolved silently
-- ---------------------------------------------------------------------------------------

create table if not exists lastro.payment_reviews (
  id                      uuid primary key,
  kind                    text not null check (kind in ('amount_mismatch', 'duplicate_purchase', 'unknown_order', 'cancel_renewal', 'unhandled_event')),
  status                  text not null default 'open' check (status in ('open', 'resolved')),
  user_id                 text references lastro.users (id),
  order_id                uuid references lastro.orders (id),
  charge_id               uuid references lastro.charges (id),
  subscription_id         uuid references lastro.subscriptions (id),
  provider                text,
  gateway_transaction_id  text,
  detail                  jsonb not null default '{}'::jsonb,
  attempts                integer not null default 0,
  next_attempt_at         timestamptz,                         -- set for kinds Lastro retries itself (cancel_renewal)
  last_error              text,
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz
);
-- Same check again by name, so re-running this file on a database that has an older copy of
-- the table also accepts the newest review kinds.
alter table lastro.payment_reviews drop constraint if exists payment_reviews_kind_check;
alter table lastro.payment_reviews add constraint payment_reviews_kind_check
  check (kind in ('amount_mismatch', 'duplicate_purchase', 'unknown_order', 'cancel_renewal', 'unhandled_event'));
create index if not exists payment_reviews_open_idx on lastro.payment_reviews (status, kind, next_attempt_at);

-- ---------------------------------------------------------------------------------------
-- "Pagar depois": where to send the person next. Never read for authorization.
-- ---------------------------------------------------------------------------------------

alter table lastro.users add column if not exists checkout_deferred_at timestamptz;

alter table lastro.access_entitlements enable row level security;
alter table lastro.payment_reviews enable row level security;
