# Checkout, plans and access

How a Lastro account goes from sign-up to paid access, and how the payment gateways plug in:
Simplify for Pix and Mercado Pago for card, both used only to process the payment — the buyer
never leaves Lastro's checkout. The rule behind all of it: **only a verified confirmation from the gateway turns
money into access.** No page, browser call, URL or button can.

## Plans — one catalog

`src/config/plans.ts` is the only place plans are defined. The landing, the checkout, the
profile card and the server all read it.

| id | Name | Price | Billing |
|---|---|---|---|
| `mensal` | Mensal | 1990 centavos (R$ 19,90) | monthly |
| `vitalicio` | Vitalício | 9990 centavos (R$ 99,90) | one time |

The ids are the ones Centralis already receives. `lastro.plans` keeps a matching row per plan
so orders can reference it. A test fails if the rows and the catalog disagree.

## The flow

```
/cadastro ──► /checkout ──► choose plan + Pix/Cartão + billing data ──► gateway charge
   │              │                                                         │
   │              └─ "Pagar depois" ──► /app (locked)                       ▼
   │                                                           verified webhook / server query
   └─ paywall off ──► /app (as today)                                       │
                                                                            ▼
                                               charge → entitlement → plan mirror → purchase event
                                                          (one database transaction)
```

- **After sign-up** the person goes to `/checkout` in two cases:
  - they arrived with `?next=/checkout`;
  - or the paywall is on and the account has no access and hasn't chosen "Pagar depois".
  
  The chosen plan travels as `?plano=`. Sign-up has no e-mail confirmation today. If one is
  added, the same `?next=` carries the person through it.
- **`/checkout` needs a session.** A visitor without one is sent to `/cadastro?next=/checkout`.
  `?next=` only accepts that one fixed internal path (`safeNext`). Anything else is ignored.
- **"Pagar depois"** (`POST /api/checkout/defer`) only records `checkout_deferred_at`, which is
  used for navigation. It creates no order, sends no event and grants nothing.
- **Pix:** the page shows the gateway's QR code, the copy-and-paste code and the expiry. It then
  asks the server for the status every few seconds (`GET /api/checkout/orders/:id`). The
  server confirms with the gateway's webhook or an authenticated status query. There is no
  "Já paguei" button.
- **Card:** handled only by the gateway's hosted page, iframe or SDK. Lastro never sees, sends
  or stores the card number or CVV. The adapter returns either `redirect` (hosted page) or
  `awaiting` (the gateway confirms by itself).
- **Confirmation:** after it, the page shows "Pagamento confirmado" and opens `/app`. The
  session stays the same: no new login and no new account. If the tab is closed, the webhook
  still completes everything on the server.

## Access (authorization)

Authentication answers "who is this?" (session cookie). Plan access answers "may they use
the product now?". The two are separate.

- **`lastro.access_entitlements`:** one row per confirmed charge, or per administrative
  grant.
  - Vitalício: no end date.
  - Mensal: one row per paid month.
  - Access is computed from the dates on every request, so a month ends by itself.
- **Only the payment pipeline (or a database operator) writes entitlements.** Profile edits,
  `localStorage`, cookies, URL parameters and anything the browser sends never do.
- **Refund or chargeback** revokes only that charge's entitlement. A late monthly event can
  never touch a lifetime entitlement.
- **`users.plan_id`** (what Centralis sees) is derived from the entitlements:
  - `refreshUserPlan` updates it in the same transaction as the payment;
  - `expireLapsedPlans` updates it when a month runs out, from the scheduled flush, so no one
    needs to open the app.

**Where access is enforced:**

| Point | Check |
|---|---|
| `/app` layout | computes access on the server; with the paywall on and no access, the money tools (composer, flows) are not mounted |
| Each paid page (`/app`, movimentos, planejamento, orçamentos, metas, reserva, crescer, investimentos, patrimônio, aulas) | `canUsePaidProduct()` on the server, per request. Without access the page renders `LockedScreen` **instead of** the module, so the module's components never mount (verified on the RSC payload in the e2e test) |
| `/app/perfil`, `/checkout`, sign-out, `/termos`, `/privacidade` | always available |
| Payment, checkout and access APIs | session from the httpOnly cookie, user id never taken from the body |

**Limitation:** the financial data (movements, goals, budgets…) lives **on the user's device**
(`localStorage`), as it did before this change. There is no server API for it to protect.
- What the server controls is which modules are rendered.
- A technically skilled person could still run the app's code against their own local data.
- Making that impossible means moving the financial data to the server. That is a separate
  project.
- The on-device **demo** ("Explorar com dados de demonstração") has no server account and is
  not affected by the paywall.

## Monthly periods

- **When the gateway states the paid period** (`periodStart` / `periodEnd`), it is used as-is.
- **Otherwise the calendar rule applies:** same day next month at the same time, in Brasília
  time. When that day doesn't exist, the period ends on the last day of the month:
  - 31/01 → 28/02 (or 29/02 in a leap year);
  - 31/03 → 30/04.
  
  `addBillingMonth`, tested.
- **A month confirmed while another is still running** extends it instead of overlapping.
- **Pix comum:** each payment covers one month. There is no automatic debit, and the UI says
  so.
- **"Próxima cobrança"** only appears for a real recurring subscription from the gateway.
  Otherwise the profile shows "Acesso válido até".
- **"Cancelar renovação"** (`POST /api/me/subscription/cancel`) calls the gateway. Only after
  the gateway confirms does Lastro mark the subscription `cancel_at_period_end`; the paid
  month is kept.
- **No grace period, no retroactive charge, no tolerance** is invented. A failed renewal does
  not take away time already paid.

## Upgrade mensal → vitalício

- **The only plan change that exists.** Vitalício → mensal is refused by the UI and the API
  (`already_lifetime`), and so is buying another month while a month is active
  (`already_monthly`).
- **While the upgrade is pending,** the monthly access continues.
- **After the lifetime payment is confirmed:**
  - the lifetime becomes effective;
  - `user.plan_changed` and `purchase` go to Centralis;
  - a `cancel_renewal` review asks the gateway to stop the monthly renewals, retried with
    backoff by the scheduled flush.
  
  The subscription is only marked as "won't renew" after the gateway confirms. Until then the
  profile says the cancellation is in progress.
- **No credit or discount.** The lifetime costs R$ 99,90.

## Duplicates, ordering, reconciliation

**Duplicates — no double order or charge:**

| Case | What happens |
|---|---|
| Same idempotency key | same order |
| Second tab, refresh | the open order for the same plan and method is reused |
| New plan or method | the old pending order is superseded |
| Concurrency guard | a unique index allows one pending order per user, with the user's row locked |
| Gateway timeout | not "no payment": the order stays pending; the retry calls the gateway again with the order id as its idempotency key |

**Duplicate events — no double access, revenue or commission:**
- the gateway event id is unique (`processed_webhooks`);
- the gateway transaction id is unique (`charges`);
- the charge id is unique (`access_entitlements`).

**Out of order:**
- A refund that arrives before its payment, or a renewal before its subscription, is **not
  recorded**. The webhook answers 503 and the gateway delivers it again later.
- A status query and a webhook for the same transaction produce one charge.

**`lastro.payment_reviews` holds cases that need a person** (never resolved silently):

| Kind | When |
|---|---|
| `amount_mismatch` | the amount or currency differs from the order; no access is granted |
| `duplicate_purchase` | e.g. lifetime bought twice, or a renewal charged after the upgrade; nothing is refunded automatically |
| `unknown_order` | a confirmation for an order this gateway doesn't have |
| `cancel_renewal` | renewal cancellation after an upgrade; Lastro retries it itself |

## Centralis

Nothing new is invented; the existing outbox, events and attribution are reused.

| Moment | Event |
|---|---|
| Checkout opened | `checkout.started` → `checkout_start` (not a purchase) |
| Pix issued / pending / failed / expired | nothing (failed keeps the existing `payment.failed`) |
| "Pagar depois" | nothing |
| Confirmed payment | `purchase` with the amount the gateway confirmed, in reais (`9990` → `99.9`), BRL, the plan, and the affiliate valid **at payment time** |
| Monthly renewal | its own `purchase` (`kind: renewal`) with the subscription's original affiliate |
| Upgrade | a `purchase` of `vitalicio`; Centralis decides whether it earns commission |
| Refund / chargeback | `refund` |

- **Attribution:** last click, 30 days by default per affiliate (unchanged).
  - Signing up carries the visitor's click to the account, so link → sign-up → "Pagar depois"
    → purchase days later is still attributed, inside the window.
  - Outside the window, or with no click, the purchase has no affiliate.
  - The order also keeps a snapshot of the attribution at checkout, for audit.
- **Pending decision — commission on renewals and upgrades** is Centralis's rule, not
  Lastro's. Lastro reports each charge as it happens.
- **Data that is never sent:** CPF, card data, passwords, tokens and secrets never appear in
  events.
- **The CPF typed at checkout is not stored by Lastro at all.** It goes to the gateway in the
  charge request only.

## Paywall switch, activation and rollback

`LASTRO_PAYWALL=on` turns the paywall on. Anything else (default) keeps today's behavior:
- everyone uses the app;
- sign-up goes to `/app`;
- the profile shows a plan card only when something was bought or is pending;
- `/checkout` still works and says honestly when payments are unavailable.

**Activation order:**

1. Apply `supabase/migrations/20261008000000_checkout_access.sql` on Supabase. It is
   additive and safe to run twice.
2. Deploy this code with `LASTRO_PAYWALL` **unset**. Nothing changes for users.
3. Configure the gateways and validate each with a real sale ("Setting it up" below).
4. Decide how to treat **existing accounts** (see pending decisions) and create their grants
   if any.
5. Set `LASTRO_PAYWALL=on` and redeploy.

**Rollback:**
- Unset `LASTRO_PAYWALL` and redeploy. Everyone has access again and no data is lost.
- The migration doesn't need to be undone: its tables and columns are only read by this code.

**Administrative grant** (a person decides; never automatic):

```sql
insert into lastro.access_entitlements (id, user_id, source, starts_at, ends_at, note)
values (gen_random_uuid(), '<user id>', 'admin', now(), null, '<why>');
```

## Gateways — one per payment method

| Method | Gateway | Variable | Adapter |
|---|---|---|---|
| Pix | Simplify | `PAYMENT_PROVIDER_PIX=simplify` | `src/server/payments/simplify.ts` |
| Card | Mercado Pago | `PAYMENT_PROVIDER_CARD=mercadopago` | `src/server/payments/mercadopago.ts` |

`PAYMENT_PROVIDER` sets both at once (e.g. `sandbox` in tests). A method whose gateway is
missing or not fully configured is simply not offered; with none, payments are unavailable.
Each order stores its gateway, so webhooks, the page's status checks and refunds always go to
the gateway that charged it.

## Mercado Pago (card)

"Checkout Transparente": the card is typed on Lastro's page, into Mercado Pago's **secure
fields** (Mercado Pago's iframes, styled like Lastro's inputs, `CardFields.tsx`). Mercado Pago
returns a single-use token; only the token reaches Lastro. The card number and CVV never touch
Lastro's page code, server, database, logs, analytics or Centralis.

```
/checkout (Lastro) ── MercadoPago.js secure fields ──► card token (browser ↔ Mercado Pago)
  ──POST /api/checkout { card: { token, payment_method_id, issuer_id } }──► Lastro server
  ──POST /v1/payments { token, catalog price, installments: 1, external_reference: order id }──► Mercado Pago
page polls /api/checkout/orders/<id> ──► GET /v1/payments/<id> (Mercado Pago) → checks → access
Mercado Pago webhook ──(x-signature)──► /api/payments/webhook/mercadopago ──GET /v1/payments/<id>──► checks → access
```

- **Keys.** The access token stays on the server. The public key goes to the browser (it can
  only create card tokens, not charges).
- **The charge.** Price from the catalog (never the browser), 1 installment, our order id as
  `external_reference`, buyer name/e-mail/CPF as payer (CPF goes to Mercado Pago only, never
  stored). `X-Idempotency-Key` = hash of order id + card token: a retry can't charge twice; a
  new card after a refusal is a new attempt.
- **Authenticity.** The webhook's `x-signature` (HMAC-SHA256 over
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with the webhook secret) must match —
  otherwise `401` and no API call. Even then, the webhook is only a pointer: status and
  amount come from `GET /v1/payments/<id>` with Lastro's access token.
- **Status mapping:**

  | Mercado Pago | Lastro |
  |---|---|
  | `approved` | `payment.approved` |
  | `pending`, `in_process`, `authorized` | pending (nothing released) |
  | `rejected`, `cancelled` | `payment.failed` |
  | `refunded` / `charged_back` | `payment.refunded` (refund / chargeback) |
  | `in_mediation`, anything else | `unhandled` → a person looks at it |

- **Amount.** Must equal the plan's price; otherwise review, no access.
- **Monthly.** One card payment = one month (no automatic renewal yet). When the month ends
  the account pays another month, or upgrades to Vitalício.

### Setting it up (once)

1. **Mercado Pago → Suas integrações → Criar aplicação** ("Pagamentos online", "Checkout
   Transparente"). Copy the production **Public key** and **Access token**.
2. **Webhooks** in that application: URL `https://<site>/api/payments/webhook/mercadopago`,
   event **Pagamentos**. Copy the **assinatura secreta**.
3. **On Vercel**: `PAYMENT_PROVIDER_CARD=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN`,
   `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` (see `.env.example`).
4. **One real low-value purchase**: the order is `approved` in `lastro.orders`, the
   webhook shows `200` in Mercado Pago's panel, no open `unhandled_event` review. Refund it
   from Mercado Pago and check the access is revoked.
5. **Only then** `LASTRO_PAYWALL=on`.

## Simplify (Pix)

Documentation: https://simplifybr.gitbook.io/documentacao-simplify. The buyer sees the Pix QR
code and the copy-and-paste code on Lastro's own page.

```
/checkout ──POST /api/checkout──► Lastro server ──POST /pix/deposit { amount, payer, external_id: order id,
                                                   webhookURL: …/webhook/simplify?order=<id>&token=<per-order token> }──► Simplify
                                  ◄── { internal_id, status: pending, qrcode }
page shows QR + copy-and-paste, polls /api/checkout/orders/<id>
Simplify ──POST { event: deposit.paid, internal_id, external_id, status, amount }──► that order's webhook URL → checks → access
```

- **Credentials.** `client-id` / `client-secret` headers, server-side only.
- **Authenticity.** Simplify's documentation has **no webhook signature and no endpoint to
  query a deposit**. So each deposit gets its own webhook URL with a token =
  HMAC-SHA256(`SIMPLIFY_WEBHOOK_SECRET`, order id). The URL goes only from Lastro's server to
  Simplify (HTTPS) and is not stored in the order's public instructions. A notification is
  accepted only with the right token for that order **and** a body whose `external_id` is the
  same order. Amount, plan and duplicates are then checked like any gateway's.
- **Do not configure "Webhooks Avançado" in Simplify's panel** for Lastro: those notifications
  wouldn't carry the per-order token and are refused (`401`). Each deposit already tells
  Simplify where to notify.
- **Event mapping:** `deposit.paid` with status `approved` → `payment.approved`;
  `deposit.cancelled` → `payment.expired`; `deposit.pending` → pending; anything else (or
  `deposit.paid` with another status) → `unhandled` for a person.
- **Payer data.** Simplify requires name, e-mail, CPF and phone: the checkout asks all four
  for Pix. They go to Simplify only; Lastro doesn't store the CPF.
- **Expiry.** Simplify doesn't document one; Lastro shows/reuses a Pix code for 30 minutes,
  then a new checkout creates a new deposit. A late payment of an older code is still honored.
- **Refunds.** No refund event is documented for deposits: a Pix refund done in Simplify must
  be mirrored by a person (revoke the access).
- **Without a status query**, a lost notification (Simplify retries 3×, 60 s apart) leaves the
  order pending: a person can confirm it in Simplify's panel and grant the access.

### Setting it up (once)

1. **Simplify → Integrações → API**: copy the **client-id** and **client-secret**.
2. **Create `SIMPLIFY_WEBHOOK_SECRET`**: a random text of at least 32 characters, created by
   you (not from Simplify) — e.g. a password generator with 48 letters and digits.
3. **On Vercel**: `PAYMENT_PROVIDER_PIX=simplify`, `SIMPLIFY_CLIENT_ID`,
   `SIMPLIFY_CLIENT_SECRET`, `SIMPLIFY_WEBHOOK_SECRET`.
4. **One real Pix** of the Mensal plan: the order is `approved`, access is released.

## Without a gateway

- No gateway configured for any method → `POST /api/checkout` answers
  `503 payments_unavailable` before storing anything: no order, no billing data, no event.
- The checkout shows the plans, explains that payments aren't available yet, disables the pay
  button and keeps "Pagar depois".
- **The `sandbox` gateway only exists in isolated environments:**
  - development without `DATABASE_URL`;
  - or a production build on the embedded database.
  
  It is never available next to Supabase in production, and there is no override. Its "Pix
  code" is a label (`SANDBOX-NAO-PAGAVEL-…`), not a payable BR Code.

## Connecting another gateway — checklist

1. Write `src/server/payments/<gateway>.ts` implementing `PaymentProvider` (`provider.ts`),
   and register it in `registry.ts`.
2. **`createCheckout`:**
   - use the order id as the gateway's external reference **and** idempotency key;
   - return `pix`, `redirect` or `awaiting`;
   - set `hostedCheckout: true` when the gateway's page collects the billing data.
3. **`parseWebhook`:**
   - verify the gateway's authentication;
   - reject other accounts and test-mode events in production;
   - map to `payment.approved` (captured money only), `payment.pending`, `payment.failed`,
     `payment.expired`, `payment.refunded` (`refundReason: "chargeback"` for disputes),
     `subscription.renewed`, `subscription.cancelled`, or `unhandled`;
   - always fill `amountMinor` and `currency`, plus `planId` when the gateway names the
     product.
4. **`getPayment` / `cancelSubscription`:** only if the gateway really has them.
5. Point the gateway's webhook to `https://<site>/api/payments/webhook/<gateway id>`.
6. Test in the gateway's test mode, on a preview with a separate database.

## Environment variables

| Variable | Where | Meaning |
|---|---|---|
| `LASTRO_PAYWALL` | server | `on` enforces plan access; unset = today's behavior |
| `PAYMENT_PROVIDER_PIX` | server | Pix gateway: `simplify` |
| `SIMPLIFY_CLIENT_ID` | server | Simplify client-id |
| `SIMPLIFY_CLIENT_SECRET` | server | Simplify client-secret (secret) |
| `SIMPLIFY_WEBHOOK_SECRET` | server | Lastro's own secret (≥ 32 chars) that signs each deposit's webhook URL |
| `PAYMENT_PROVIDER_CARD` | server | card gateway: `mercadopago` |
| `PAYMENT_PROVIDER` | server | both methods at once (e.g. `sandbox` in tests) |
| `MERCADOPAGO_ACCESS_TOKEN` | server | Mercado Pago access token (secret) |
| `MERCADOPAGO_PUBLIC_KEY` | server → browser | public key for the secure card fields |
| `MERCADOPAGO_WEBHOOK_SECRET` | server | webhook "assinatura secreta" (≥ 16 chars) |
| `MERCADOPAGO_STATEMENT_DESCRIPTOR` | server | optional, name on the card statement (default `LASTRO`) |
| `PAYMENT_SANDBOX_SECRET` | dev/test only | sandbox webhook HMAC secret |
| `CRON_SECRET` | server | the scheduled flush also runs plan expiry and renewal cancellations |

## Pending decisions (not invented in code)

- **Existing accounts when the paywall is turned on.** By default they would be blocked like
  any account without a plan. Lastro does not grant lifetime or create fake purchases to
  avoid that. Choose one of:
  - block them;
  - give a time-limited administrative grant;
  - give a permanent administrative grant.
- **The demo mode** stays open to everyone (demo data, no account). Decide whether it should
  become read-only once the paywall is on.
- **Commission on renewals and upgrades:** Centralis's configuration.
- **The landing's "Cobrança todo mês, enquanto você usar."** is accurate for Pix (one payment
  per month). If a recurring card is offered, revisit the copy.
