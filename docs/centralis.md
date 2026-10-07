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

## Signing (both directions)

```
X-Centralis-Timestamp: <unix seconds>
X-Centralis-Signature: v1=<hex HMAC-SHA256(CENTRALIS_WEBHOOK_SECRET,
                         "<timestamp>.<METHOD>.<path>.<sha256_hex(raw body)>")>
```

Requests more than 300 s from Lastro's clock are rejected; comparison is constant-time.
Lastro → Centralis also sends `Authorization: Bearer $CENTRALIS_API_KEY` and
`X-Centralis-Product-Id`.

## Centralis → Lastro: commands

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

`POST {CENTRALIS_API_URL}/v1/events` (signed), body
`{ "schema_version": "1.0", "product_id": "…", "events": [ … ] }`, up to 50 events.
Any 2xx = all accepted. Deduplicate on `event_id` — retries resend the same id. 4xx (except
408/429) marks the batch failed (no blind retries); 5xx/408/429/timeouts retry with backoff
(30 s × 4ⁿ, capped at 6 h, 12 attempts).

Every event: `schema_version`, `event_id` (uuid), `event`, `timestamp`, `product_id`.

| event | when | main fields |
|---|---|---|
| `user.created` / `user.updated` / `user.plan_changed` / `user.subscription_changed` / `user.status_changed` / `user.deactivated` | account changes | `user` (allowlist below), `previous_plan_id?`, `reason?` |
| `signup` | account created | `user.external_user_id`, `visitor_id`, `affiliate` or `null` |
| `login` | sign-in | `user.external_user_id`, `visitor_id` |
| `session.started` / `page_view` | browsing (only while enabled) | `visitor_id`, `session_id`, `page` (path only) |
| `affiliate.click` | a valid `?ref=` landing, once per session per affiliate | `visitor_id`, `session_id`, `affiliate {id, centralis_affiliate_id, code}`, `landing_page`, `referrer`, `utm` |
| `affiliate.attributed` | that click became the visitor's attribution | `affiliate`, `model: "last_click"`, `attributed_at`, `expires_at` |
| `checkout.started` | order opened — **not a purchase** | `order {external_order_id, plan_id, plan_name, amount_minor, currency, status: "pending"}`, `affiliate` |
| `purchase` | the gateway confirmed money (every paid charge, first and renewals) | see below |
| `refund` | the gateway confirmed a refund | `refund {external_refund_id, amount_minor, currency, refunded_at}`, `original {external_order_id, external_charge_id, gateway_transaction_id, plan_id, amount_minor, currency}`, `affiliate` |
| `subscription.created` / `subscription.renewed` / `subscription.cancelled`, `payment.failed` | recurring lifecycle | `subscription {external_subscription_id, plan_id, status}`, `order` |
| `affiliate.promoted` / `affiliate.updated` / `affiliate.suspended` / `affiliate.activated` | confirmation of a command | `action_id`, `user`, `affiliate {centralis_affiliate_id, code, status, …}` |

```json
{
  "schema_version": "1.0", "event_id": "…", "event": "purchase", "timestamp": "2026-10-07T13:04:46.792Z",
  "product_id": "…",
  "user": { "external_user_id": "u_…" },
  "visitor_id": "…",
  "order": {
    "external_order_id": "…", "external_charge_id": "…", "gateway": "stripe", "gateway_transaction_id": "…",
    "kind": "initial", "plan_id": "vitalicio", "plan_name": "Vitalício", "billing": "one_time",
    "amount_minor": 9990, "currency": "BRL", "status": "approved", "paid_at": "…"
  },
  "affiliate": { "centralis_affiliate_id": "…", "code": "JOAO" }
}
```

Revenue = Σ `purchase.order.amount_minor` − Σ `refund.refund.amount_minor`. Direct sales
have `"affiliate": null`. Renewals (`kind: "renewal"`) carry the attribution the
subscription was born with; whether they earn commission is Centralis's rule.

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
