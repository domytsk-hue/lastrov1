# Lastro × Centralis Hub — integration

Lastro is the authority on users, sign-in, plans, payments and access. Centralis is the
authority on affiliates (who, code, status, commission rate) and on commission math. Lastro
never computes a commission: it reports what the payment gateway confirmed, with the
attribution it observed.

The integration is invisible infrastructure. With `CENTRALIS_ENABLED=false` Lastro runs as
before. With it on, a Centralis outage never blocks sign-in, checkout, payment or use of the
product — events wait in an outbox.

## Setup

1. **Database (Supabase).** Apply `supabase/migrations/*.sql` (`supabase db push`, the SQL
   editor, or `DATABASE_URL=… npm run db:migrate`). Tables live in the `lastro` schema — not
   exposed by Supabase's REST API — with RLS enabled and no policies. Lastro connects
   directly with `DATABASE_URL` (transaction pooler, port 6543, on serverless hosts).
2. **Environment.** See `.env.example`. Secrets are server-only (never `NEXT_PUBLIC_`).
3. **Outbox drain.** Events are sent right after each request (`after()`), and must also be
   drained on a schedule: call `GET /api/integrations/centralis/outbox/flush` with
   `Authorization: Bearer $CRON_SECRET` every minute (Vercel Cron, Supabase `pg_cron` +
   `net.http_get`, or any scheduler). Each call delivers up to 1,000 events in batches of 50.
4. **First enablement.** On the first drains after `CENTRALIS_ENABLED=true`, every existing
   user is queued as `user.updated` (`reason: "initial_sync"`), 200 per drain, resumable.

Without `DATABASE_URL`, development uses an embedded Postgres (PGlite) in `.data/` running
the same migrations. Production refuses to start without `DATABASE_URL`.

## Identity

Every payload carries `product_id` (`CENTRALIS_PRODUCT_ID`). A user is identified by
`product_id + external_user_id` (Lastro ids look like `u_<uuid>`). All timestamps are UTC
ISO-8601. Money is integer minor units + ISO currency (`amount_minor: 9990, currency: "BRL"`).

## Authentication

- **Lastro → Centralis** (events): `Authorization: Bearer <integration key>` — the
  `cx_live_….<secret>` key generated for the Lastro system in Centralis (Integrações → API).
  Centralis identifies the system by that key.
- **Centralis → Lastro** (commands): HMAC signature with the shared
  `CENTRALIS_WEBHOOK_SECRET`:

```
X-Centralis-Timestamp: <unix seconds>
X-Centralis-Signature: v1=<hex HMAC-SHA256(CENTRALIS_WEBHOOK_SECRET,
                         "<timestamp>.<METHOD>.<path>.<sha256_hex(raw body)>")>
```

Requests more than 300 s from Lastro's clock are rejected; comparison is constant-time.

## Centralis → Lastro: commands

Centralis Hub sends these automatically ("Integrações → Comandos para os sistemas" in
Centralis): every affiliate promotion, edit, commission change, suspension, reactivation
and every change to an affiliate's commission figures. It signs each command with the
secret it generated for Lastro (`CENTRALIS_WEBHOOK_SECRET` here), delivers them in order
per affiliate and retries with backoff. If Lastro answers `affiliate_not_found` to an
update, Centralis resends the full profile as `affiliate.promote`.

`POST /api/integrations/centralis/actions` (signed). Envelope:

```json
{ "schema_version": "1.0", "action_id": "<uuid>", "action": "affiliate.promote",
  "product_id": "<uuid>", "...": "action fields" }
```

| action | fields | effect |
|---|---|---|
| `affiliate.promote` | `external_user_id`, `affiliate: { centralis_affiliate_id, code, commission_rate?, attribution_window_days? (30), status? (active) }` | Attaches an affiliate profile to the **existing** user (never a new account). Re-promoting the same `centralis_affiliate_id` updates in place. |
| `affiliate.update` | `centralis_affiliate_id` or `external_user_id`, `affiliate: { code?, commission_rate?, attribution_window_days?, status? }` | Updates the profile. |
| `affiliate.suspend` / `affiliate.activate` | `centralis_affiliate_id` or `external_user_id` | Status change. History (clicks, sales) is never deleted. |
| `affiliate.stats_sync` | `centralis_affiliate_id`, `stats: { commission_generated_minor, pending_commission_minor, paid_commission_minor, currency }` | Commission figures shown on the affiliate's dashboard (a projection, not accounting). |
| `resync.user` | `external_user_id` | Re-queues the user (`user.updated`, `reason: "resync"`). |
| `resync.affiliate` | `centralis_affiliate_id` | Re-queues `affiliate.updated` (`reason: "resync"`). |
| `resync.order` | `external_order_id` | Re-delivers that order's events **with their original `event_id`s**. |
| `sync.users` | `cursor?`, `limit?` (≤ 1000) | Queues a batch of users; returns `next_cursor`. |

`commission_rate` is a fraction (`0.2` = 20 %), stored only as a reference for display.
Codes are case-insensitive, stored uppercase, 2–32 of `A–Z 0–9 _ -`, unique per product.

Response (acknowledgement):

```json
{ "success": true, "action_id": "<uuid>", "result": { "created": true, "code": "JOAO", "...": "..." } }
{ "success": false, "action_id": "<uuid>", "error": { "code": "user_not_found", "message": "…" } }
```

Idempotency: the first outcome for an `action_id` is stored; a replay returns it again with
`"idempotent": true`. Reusing an `action_id` with a different body returns `409
action_id_reused`. Error codes: `invalid_json`, `invalid_action_id`,
`unsupported_schema_version`, `wrong_product` (403), `unknown_action`, `user_not_found`
(404), `affiliate_not_found` (404), `already_affiliate`, `code_taken`,
`centralis_affiliate_id_taken`, `affiliate_user_mismatch` (409), `invalid_*` (422),
signature errors (401), `integration_disabled` (503). Every command is kept in
`lastro.centralis_actions` as the local audit trail (no secrets).

`GET /api/integrations/centralis/health` (signed, or `Bearer $CRON_SECRET`): enabled,
configured, initial-sync progress, outbox counts (pending / processing / failed / sent),
oldest pending, last successful delivery.

## Lastro → Centralis: events

Lastro keeps its own event shapes in the outbox (below) and translates them at delivery
(`src/server/centralis/v1.ts`) to Centralis Hub's ingestion contract:

`POST {CENTRALIS_API_URL}/api/v1/events` · `{ "events": [ … ] }` (batches of 50, max 100)

Centralis answers per event (`accepted` / `duplicate` → sent; `rejected` → failed, kept with
the validation message; `failed` → retried). 401 (key), 429 (rate limit), 5xx and timeouts
retry with backoff (30 s × 4ⁿ, capped at 6 h, 12 attempts). `event_id` makes resends safe.

| Lastro (internal) | Centralis `type` | notes |
|---|---|---|
| `user.created/updated/plan_changed/status_changed/subscription_changed/deactivated` | `user_updated` | full allowlisted `user`; `data.change` says which |
| `signup` | `signup` | full `user`, `visitor_id`, `data.affiliate_code` |
| `login` | `login` | `user.id` |
| `session.started` / `page_view` | `session_start` / `page_view` | `page.path` only |
| `affiliate.click` | `affiliate_click` | `visitor_id`, `session_id`, `data.code`, `page`, `utm` |
| `checkout.started` | `checkout_start` | `data.order_id/plan/amount/currency/affiliate_code` |
| `purchase` | `purchase` | `data.order_id` = charge id (renewals are their own order), `amount` in reais (`99.9`), `currency`, `status: "paid"`, `affiliate_code`, `subscription_id`, `plan` |
| `refund` | `refund` | `data.order_id` = the refunded charge id, `amount` |
| `subscription.created/renewed/cancelled` | `subscription_started/renewed/cancelled` | `data.subscription_id` (+ plan, amount, interval month) |
| `affiliate.attributed`, `affiliate.promoted/updated/suspended/activated`, `payment.failed` | same name (custom) | no personal data |

User status maps `active → active`, `suspended → blocked`, `deactivated → inactive`.
The mapping is checked in tests against the same rules as Centralis's validator.

Internal shapes (kept in `lastro.centralis_outbox`), for reference:

| event | when | main fields |
|---|---|---|
| `user.*` | account changes | `user` (allowlist below), `previous_plan_id?`, `reason?` |
| `signup` / `login` | account created / sign-in | `user`, `visitor_id`, `affiliate` or `null` |
| `affiliate.click` | a valid `?ref=` landing, once per session per affiliate | `visitor_id`, `session_id`, `affiliate {centralis_affiliate_id, code}`, `landing_page`, `referrer`, `utm` |
| `checkout.started` | order opened — **not a purchase** | `order {external_order_id, plan_id, amount_minor, currency, status: "pending"}` |
| `purchase` | the gateway confirmed money (every paid charge) | `order {external_order_id, external_charge_id, external_subscription_id, kind, plan_id, amount_minor, currency, paid_at}`, `affiliate` |
| `refund` | the gateway confirmed a refund | `refund {amount_minor, …}`, `original {external_order_id, external_charge_id, …}` |

### User allowlist

`external_user_id, name, email, phone (E.164), plan_id, plan_name, account_status,
subscription_status, created_at, updated_at` — built field by field in
`serializeUserForCentralis`. Columns added to the database later are **not** sent unless
added there.

**Never sent:** CPF (Lastro doesn't collect it), passwords, password hashes, salts, session
ids/tokens, cookies, API keys, secrets, card or bank data. Every payload is also scanned
for forbidden key names before it is queued; a test runs the full flow and checks every
event.

## Attribution

Last click, 30-day window by default (per affiliate, set by Centralis). A click is a valid
`?ref=CODE` (or `/r/CODE`) landing by an active affiliate, counted once per browsing session;
unique visitors are distinct anonymous `visitor_id`s (httpOnly cookie, 400 days); sessions
end after 30 minutes idle. On sign-up the visitor's attributions follow the user, so a later
purchase from any device is still attributed. Attribution is decided at payment time and
snapshotted on the charge.

## Payments

A payment exists only when a gateway webhook is verified
(`POST /api/payments/webhook/:provider`). Success pages, client calls or a pending payment
create nothing. Each gateway transaction id becomes at most one charge, so duplicated
webhooks produce one purchase. Approving an order, releasing the plan and queueing
`purchase` happen in one database transaction.

Gateways are adapters (`src/server/payments/provider.ts`): implement `createCheckout` and
`parseWebhook` for Stripe / Mercado Pago / Asaas / Pagar.me and register it in
`registry.ts`. The `sandbox` adapter (HMAC-signed with `PAYMENT_SANDBOX_SECRET`, refused in
production) exercises the whole flow until a real gateway is chosen. The plan price always
comes from `lastro.plans`, never from the browser.

## Affiliate area

`GET /api/me/affiliate` and `/api/me/affiliate/stats` resolve the affiliate from the session
user only. Anything but an `active` profile returns `null`, and the profile page renders
nothing — no placeholder, no invitation. Numbers are aggregates (visits, unique visitors,
sign-ups, purchases, conversion, revenue) computed from Lastro's own tables, plus the
commission figures Centralis syncs. No visitor or buyer details are ever shown.

## Code map

```
supabase/migrations/            schema (lastro.*)
src/server/db/                  Supabase (postgres.js) / PGlite adapter
src/server/env.ts               server-only configuration
src/server/auth/accounts.ts     accounts and sessions
src/server/centralis/           client, signature, serializer, outbox, actions, user sync, runtime
src/server/affiliates/          affiliate profiles and the "me" view
src/server/tracking/            visitors, sessions, clicks, last-click attribution
src/server/payments/            provider contract, sandbox, OrderService
src/app/api/…                   route handlers (thin)
src/app/tracker.tsx             first-party page-view / ?ref= tracker
src/components/product/profile/AffiliateSection.tsx
```
