import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browser, buy, freshDb, landWithRef, newUser, openOrder, outbox, promote, SANDBOX, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import { PLANS } from "../../config/plans.ts";
import { addBillingMonth, expireLapsedPlans, getAccess, HOLDINGS } from "../access/entitlements.ts";
import { createOrder, deferCheckout, orderStatus, processRenewalCancellations, validateBilling } from "./checkout.ts";
import { handlePaymentEvent, RetryLater } from "./orders.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { sandboxAllowed } from "./registry.ts";
import { toCentralisV1 } from "../centralis/v1.ts";
import type { Envelope } from "../centralis/outbox.ts";
import { isValidCpf, maskCpf, maskPhone, parseCpf, parsePhone } from "../../lib/billing.ts";

const DAY = 86_400_000;
const ON = HOLDINGS; // evaluate as if the paywall were on
const access = (db: Db, userId: string, at = new Date()) => getAccess(db, userId, at, ON);
const approve = (orderId: string, over: Record<string, unknown> = {}) => ({
  providerEventId: `evt_${randomUUID()}`,
  type: "payment.approved" as const,
  orderId,
  transactionId: `tx_${randomUUID()}`,
  amountMinor: 9990,
  currency: "BRL",
  occurredAt: new Date(),
  ...over,
});

/* ------------------------------------ catalog ------------------------------------ */

test("plans: one catalog — R$ 19,90/mês and R$ 99,90 único — and the database rows match it", async () => {
  const db = await freshDb();
  assert.equal(PLANS.mensal.amountMinor, 1990);
  assert.equal(PLANS.vitalicio.amountMinor, 9990);
  const rows = await db.query<{ id: string; amount_minor: number; currency: string; billing: string }>(`select id, amount_minor, currency, billing from lastro.plans order by id`);
  assert.deepEqual(
    rows.map((r) => [r.id, r.amount_minor, r.currency, r.billing]),
    Object.values(PLANS)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => [p.id, p.amountMinor, p.currency, p.billing]),
  );
});

/* ---------------------------------- billing fields ---------------------------------- */

test("billing: CPF check digits, masks and phone normalization; the account e-mail wins", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.deepEqual(parseCpf(" 529 982 247 25 "), { ok: true, value: "52998224725" });
  assert.equal(parseCpf("123").ok, false);
  assert.equal(maskCpf("52998224725"), "529.982.247-25");
  assert.deepEqual(parsePhone("(11) 98765-4321"), { ok: true, value: "+5511987654321" });
  assert.deepEqual(parsePhone("+55 11 98765-4321"), { ok: true, value: "+5511987654321" });
  assert.equal(parsePhone("(11) 88765-4321").ok, false);
  assert.equal(maskPhone("11987654321"), "(11) 98765-4321");

  const typed = validateBilling({ name: "  Maria   Souza ", cpf: "529.982.247-25", phone: "11987654321", email: "outra@x.com" }, "conta@lastro.com");
  assert.ok(typed.ok);
  assert.deepEqual(typed.value, { name: "Maria Souza", document: "52998224725", phone: "+5511987654321", email: "conta@lastro.com" });
  const bad = validateBilling({ name: "Maria", cpf: "000", phone: "", email: "" }, null);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys((bad as { errors: object }).errors).sort(), ["cpf", "email", "name", "phone"]);
});

/* ------------------------------------- orders ------------------------------------- */

test("checkout: the price is the catalog's, unknown plans and methods are refused", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const r = await createOrder(db, config, { userId: u, planId: "mensal", method: "pix", idempotencyKey: "k_aaaaaaaa", visitorId: null, provider: SANDBOX });
  assert.ok(r.ok);
  assert.equal(r.order.amount_minor, 1990);
  assert.equal(r.order.currency, "BRL");
  assert.equal((await createOrder(db, config, { userId: u, planId: "premium", method: "pix", idempotencyKey: "k_bbbbbbbb", visitorId: null, provider: SANDBOX })).ok, false);
  const m = await createOrder(db, config, { userId: u, planId: "mensal", method: "boleto", idempotencyKey: "k_cccccccc", visitorId: null, provider: SANDBOX });
  assert.deepEqual(m, { ok: false, error: "invalid_method" });
});

test("checkout: double click / refresh / two tabs → one pending order; a new plan supersedes the old charge", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const a = await openOrder(db, config, u, "vitalicio", { key: "same_key_123" });
  const b = await openOrder(db, config, u, "vitalicio", { key: "same_key_123" });
  const c = await openOrder(db, config, u, "vitalicio", { key: "other_tab_456" });
  assert.equal(b.orderId, a.orderId);
  assert.equal(c.orderId, a.orderId);
  assert.equal((await outbox(db, "checkout.started")).length, 1);

  const d = await openOrder(db, config, u, "mensal");
  assert.notEqual(d.orderId, a.orderId);
  const rows = await db.query<{ id: string; status: string; status_reason: string | null }>(`select id, status, status_reason from lastro.orders where user_id = $1`, [u]);
  assert.deepEqual(rows.find((r) => r.id === a.orderId), { id: a.orderId, status: "cancelled", status_reason: "superseded" });
  assert.equal(rows.filter((r) => r.status === "pending").length, 1);
  // The same key can't be reused for a different intent.
  const conflict = await createOrder(db, config, { userId: u, planId: "vitalicio", method: "pix", idempotencyKey: "same_key_123", visitorId: null, provider: SANDBOX });
  assert.deepEqual(conflict, { ok: false, error: "idempotency_conflict" });
});

test("checkout: lifetime can't buy again; an active monthly can only upgrade to lifetime", async () => {
  const db = await freshDb();
  const config = testConfig();
  const life = await newUser(db, config, "Lia");
  await buy(db, config, life);
  for (const plan of ["mensal", "vitalicio"]) {
    const r = await createOrder(db, config, { userId: life, planId: plan, method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: SANDBOX });
    assert.deepEqual(r, { ok: false, error: "already_lifetime" });
  }
  const month = await newUser(db, config, "Mel");
  await buy(db, config, month, { plan: "mensal" });
  assert.deepEqual(await createOrder(db, config, { userId: month, planId: "mensal", method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: SANDBOX }), { ok: false, error: "already_monthly" });
  const up = await createOrder(db, config, { userId: month, planId: "vitalicio", method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: SANDBOX });
  assert.ok(up.ok);
  assert.equal(up.order.purpose, "upgrade");
});

test("pay later: no order, no charge, no event to Centralis — and no access", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const before = (await db.query(`select id from lastro.centralis_outbox`)).length;
  await deferCheckout(db, u);
  await deferCheckout(db, u);
  assert.equal((await db.query(`select id from lastro.centralis_outbox`)).length, before);
  assert.equal((await db.query(`select id from lastro.orders`)).length, 0);
  const a = await access(db, u);
  assert.deepEqual([a.active, a.deferred, a.state], [false, true, "none"]);
});

/* ------------------------------- confirmation rules ------------------------------- */

test("only a verified, matching confirmation releases access: pending, failed, expired, wrong amount or currency don't", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  let { orderId } = await openOrder(db, config, u, "vitalicio");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { providerEventId: "p1", type: "payment.pending", orderId, occurredAt: new Date() }), "ignored");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { providerEventId: "f1", type: "payment.failed", orderId, occurredAt: new Date() }), "applied");
  ({ orderId } = await openOrder(db, config, u, "vitalicio"));
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { providerEventId: "x1", type: "payment.expired", orderId, occurredAt: new Date() }), "applied");
  ({ orderId } = await openOrder(db, config, u, "vitalicio"));
  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(orderId, { amountMinor: 1990 })), "review");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(orderId, { currency: "USD" })), "review");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(orderId, { amountMinor: undefined })), "review");
  // An event for another gateway's order is not this order.
  assert.equal(await handlePaymentEvent(db, config, "other", approve(orderId)), "review");

  assert.equal((await access(db, u)).active, false);
  assert.equal((await outbox(db, "purchase")).length, 0);
  assert.equal((await db.query(`select id from lastro.charges`)).length, 0);
  const reviews = await db.query<{ kind: string }>(`select kind from lastro.payment_reviews order by created_at`);
  assert.deepEqual(reviews.map((r) => r.kind), ["amount_mismatch", "amount_mismatch", "amount_mismatch", "unknown_order"]);

  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(orderId)), "applied");
  const a = await access(db, u);
  assert.deepEqual([a.active, a.state, a.planId, a.validUntil], [true, "lifetime", "vitalicio", null]);
});

test("a repeated confirmation (same event, or same transaction via the status query) grants once and reports once", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const { orderId } = await openOrder(db, config, u, "vitalicio");
  const ev = approve(orderId, { transactionId: "tx_once" });
  assert.equal(await handlePaymentEvent(db, config, "sandbox", ev), "applied");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", ev), "duplicate");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { ...ev, providerEventId: "query:payment.approved:tx_once" }), "duplicate");
  assert.equal((await db.query(`select id from lastro.access_entitlements`)).length, 1);
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("out of order: a refund that overtakes its payment is not recorded and waits; it applies after the payment", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const { orderId } = await openOrder(db, config, u, "vitalicio");
  const refund = { providerEventId: "evt_refund", type: "payment.refunded" as const, refundedTransactionId: "tx_late", amountMinor: 9990, currency: "BRL", occurredAt: new Date() };
  await assert.rejects(handlePaymentEvent(db, config, "sandbox", refund), RetryLater);
  assert.equal((await db.query(`select 1 from lastro.processed_webhooks where provider_event_id = 'evt_refund'`)).length, 0);

  await handlePaymentEvent(db, config, "sandbox", approve(orderId, { transactionId: "tx_late" }));
  assert.equal((await access(db, u)).active, true);
  assert.equal(await handlePaymentEvent(db, config, "sandbox", refund), "applied");
  const a = await access(db, u);
  assert.deepEqual([a.active, a.state], [false, "none"]);
  const [ent] = await db.query<{ status: string; revoked_reason: string }>(`select status, revoked_reason from lastro.access_entitlements`);
  assert.deepEqual(ent, { status: "revoked", revoked_reason: "refund" });
});

/* --------------------------------- monthly periods --------------------------------- */

test("monthly calendar rule: same day next month in Brasília, clamped to the month's end", () => {
  const brt = (s: string) => new Date(`${s}-03:00`);
  assert.equal(addBillingMonth(brt("2026-01-31T10:00:00")).toISOString(), brt("2026-02-28T10:00:00").toISOString());
  assert.equal(addBillingMonth(brt("2028-01-31T10:00:00")).toISOString(), brt("2028-02-29T10:00:00").toISOString());
  assert.equal(addBillingMonth(brt("2026-03-31T23:30:00")).toISOString(), brt("2026-04-30T23:30:00").toISOString());
  assert.equal(addBillingMonth(brt("2026-12-15T08:00:00")).toISOString(), brt("2027-01-15T08:00:00").toISOString());
});

test("monthly: access until the end of the paid month, payments stack, expiry blocks without deleting anything", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const paid = new Date("2026-05-10T15:00:00-03:00");
  // Pix month (no subscription): order + confirmation.
  const { orderId } = await openOrder(db, config, u, "mensal", { at: paid });
  await handlePaymentEvent(db, config, "sandbox", approve(orderId, { amountMinor: 1990, occurredAt: paid }));
  const a = await access(db, u, new Date("2026-05-20T12:00:00-03:00"));
  assert.deepEqual([a.active, a.state, a.validUntil, a.subscription], [true, "monthly", new Date("2026-06-10T15:00:00-03:00").toISOString(), null]);

  // While the month runs, buying another month is refused (renewal is not a second plan)…
  await assert.rejects(openOrder(db, config, u, "mensal", { at: new Date("2026-06-01T00:00:00-03:00") }), /already_monthly/);
  // …but a month CONFIRMED while another still runs (a late Pix) extends it, never overlaps.
  const o2 = await openOrder(db, config, u, "mensal", { at: new Date("2026-06-11T00:00:00-03:00") });
  await handlePaymentEvent(db, config, "sandbox", approve(o2.orderId, { amountMinor: 1990, occurredAt: new Date("2026-06-05T09:00:00-03:00") }));
  assert.equal((await access(db, u, new Date("2026-07-01T00:00:00-03:00"))).validUntil, new Date("2026-07-10T15:00:00-03:00").toISOString());

  // After the paid time: blocked, entitlement rows and orders untouched.
  const later = new Date("2026-07-11T00:00:00-03:00");
  const ended = await access(db, u, later);
  assert.deepEqual([ended.active, ended.state], [false, "expired"]);
  assert.equal((await db.query(`select id from lastro.access_entitlements where status = 'active'`)).length, 2);

  // The upkeep mirrors it to users.plan_id for Centralis — no app visit needed.
  assert.equal(await expireLapsedPlans(db, config, later), 1);
  const [row] = await db.query<{ plan_id: string | null }>(`select plan_id from lastro.users where id = $1`, [u]);
  assert.equal(row.plan_id, null);
  assert.ok((await outbox(db, "user.plan_changed")).some((e) => (e.payload as { previous_plan_id: string }).previous_plan_id === "mensal"));
});

test("subscription: a renewal adds the next period; cancelling renewal keeps the paid period", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const t0 = new Date("2026-03-01T10:00:00-03:00");
  const { orderId } = await openOrder(db, config, u, "mensal", { at: t0 });
  await handlePaymentEvent(db, config, "sandbox", approve(orderId, { amountMinor: 1990, providerSubscriptionId: "sub_1", occurredAt: t0 }));
  let a = await access(db, u, t0);
  assert.equal(a.subscription?.nextChargeAt, new Date("2026-04-01T10:00:00-03:00").toISOString());

  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "rn1", type: "subscription.renewed", providerSubscriptionId: "sub_1", transactionId: "tx_rn1", amountMinor: 1990, currency: "BRL", occurredAt: new Date("2026-04-01T10:00:00-03:00") });
  a = await access(db, u, new Date("2026-04-02T00:00:00-03:00"));
  assert.equal(a.validUntil, new Date("2026-05-01T10:00:00-03:00").toISOString());

  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "c1", type: "subscription.cancelled", providerSubscriptionId: "sub_1", occurredAt: new Date("2026-04-10T00:00:00-03:00") });
  a = await access(db, u, new Date("2026-04-20T00:00:00-03:00"));
  assert.deepEqual([a.active, a.subscription], [true, null]);
  assert.equal((await access(db, u, new Date("2026-05-02T00:00:00-03:00"))).active, false);
});

/* ------------------------------------- upgrade ------------------------------------- */

test("upgrade mensal → vitalício: monthly kept while pending; lifetime on confirmation; renewal stopped only when the gateway confirms", async () => {
  const db = await freshDb();
  const config = testConfig();
  const provider = createSandboxProvider("s");
  const u = await newUser(db, config);
  const t0 = new Date();
  const m = await openOrder(db, config, u, "mensal", { at: t0 });
  await handlePaymentEvent(db, config, "sandbox", approve(m.orderId, { amountMinor: 1990, providerSubscriptionId: "sub_up", occurredAt: t0 }));

  const up = await openOrder(db, config, u, "vitalicio");
  let a = await access(db, u);
  assert.deepEqual([a.active, a.state, a.pendingOrder?.purpose], [true, "monthly", "upgrade"]);

  await handlePaymentEvent(db, config, "sandbox", approve(up.orderId));
  a = await access(db, u);
  assert.deepEqual([a.state, a.planId, a.renewalCancellationPending], ["lifetime", "vitalicio", true]);
  // The renewal is not claimed cancelled before the gateway says so — first attempt fails.
  provider.state.failCancellation = true;
  assert.deepEqual(await processRenewalCancellations(db, provider), { done: 0, failed: 1 });
  let [sub] = await db.query<{ cancel_at_period_end: boolean }>(`select cancel_at_period_end from lastro.subscriptions`);
  assert.equal(sub.cancel_at_period_end, false);
  assert.equal((await access(db, u)).state, "lifetime"); // the lifetime is kept anyway

  provider.state.failCancellation = false;
  await db.query(`update lastro.payment_reviews set next_attempt_at = now() where kind = 'cancel_renewal'`);
  assert.deepEqual(await processRenewalCancellations(db, provider), { done: 1, failed: 0 });
  [sub] = await db.query<{ cancel_at_period_end: boolean }>(`select cancel_at_period_end from lastro.subscriptions`);
  assert.equal(sub.cancel_at_period_end, true);
  assert.equal((await access(db, u)).renewalCancellationPending, false);

  // A late monthly event (renewal charged, then refunded) never takes the lifetime away.
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "late_rn", type: "subscription.renewed", providerSubscriptionId: "sub_up", transactionId: "tx_late_rn", amountMinor: 1990, currency: "BRL", occurredAt: new Date() });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "late_rf", type: "payment.refunded", refundedTransactionId: "tx_late_rn", amountMinor: 1990, currency: "BRL", occurredAt: new Date() });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "late_fail", type: "payment.failed", providerSubscriptionId: "sub_up", occurredAt: new Date() });
  a = await access(db, u);
  assert.deepEqual([a.active, a.state, a.planId], [true, "lifetime", "vitalicio"]);
  const [row] = await db.query<{ plan_id: string }>(`select plan_id from lastro.users where id = $1`, [u]);
  assert.equal(row.plan_id, "vitalicio");
  // The renewal charged on top of a lifetime is flagged for a person, not refunded silently.
  assert.ok((await db.query<{ kind: string }>(`select kind from lastro.payment_reviews where kind = 'duplicate_purchase'`)).length >= 1);
  // Two purchases reported (mensal, vitalício), plus the renewal: each its own money.
  assert.deepEqual((await outbox(db, "purchase")).map((e) => (e.payload as { order: { plan_id: string; kind: string } }).order.plan_id), ["mensal", "vitalicio", "mensal"]);
});

test("a superseded order paid late is honored (money received), and a duplicate purchase is flagged", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const first = await openOrder(db, config, u, "vitalicio", { method: "pix" });
  const second = await openOrder(db, config, u, "vitalicio", { method: "card" });
  await handlePaymentEvent(db, config, "sandbox", approve(second.orderId));
  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(first.orderId)), "applied");
  const [o] = await db.query<{ status: string; status_reason: string }>(`select status, status_reason from lastro.orders where id = $1`, [first.orderId]);
  assert.deepEqual(o, { status: "approved", status_reason: "paid_after_cancel" });
  assert.equal((await db.query(`select id from lastro.payment_reviews where kind = 'duplicate_purchase'`)).length, 1);
});

/* ---------------------------------- order status ---------------------------------- */

test("order status: only the owner sees it; a server-side query to the gateway confirms; a fake 'success' does nothing", async () => {
  const db = await freshDb();
  const config = testConfig();
  const provider = createSandboxProvider("s");
  const a = await newUser(db, config, "Ana");
  const b = await newUser(db, config, "Beto");
  const { orderId } = await openOrder(db, config, a, "vitalicio");
  await db.query(`update lastro.orders set provider_payment_id = 'sbx_pay_1' where id = $1`, [orderId]);

  assert.equal(await orderStatus(db, config, b, orderId, provider), null);
  // The gateway has nothing yet: still pending, no access — whatever the browser claims.
  assert.equal((await orderStatus(db, config, a, orderId, provider))?.status, "pending");
  assert.equal((await access(db, a)).active, false);

  provider.state.payments.set("sbx_pay_1", { id: "q1", type: "payment.approved", order_id: orderId, transaction_id: "tx_q", amount_minor: 9990, currency: "BRL" });
  assert.equal((await orderStatus(db, config, a, orderId, provider))?.status, "approved");
  assert.equal((await access(db, a)).active, true);
  // The webhook for the same transaction arrives later: nothing doubles.
  assert.equal(await handlePaymentEvent(db, config, "sandbox", approve(orderId, { transactionId: "tx_q" })), "duplicate");
  assert.equal((await outbox(db, "purchase")).length, 1);
});

/* ---------------------------------- paywall switch ---------------------------------- */

test("paywall off → everyone may use the product; on → only with an entitlement (purchase or administrative grant)", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  assert.equal((await getAccess(db, u, new Date(), {})).active, true);
  assert.equal((await getAccess(db, u, new Date(), { LASTRO_PAYWALL: "on" })).active, false);
  await db.query(`insert into lastro.access_entitlements (id, user_id, source, starts_at, note) values ($1, $2, 'admin', now() - interval '1 minute', 'conta de teste')`, [randomUUID(), u]);
  const a = await getAccess(db, u, new Date(), { LASTRO_PAYWALL: "on" });
  assert.deepEqual([a.active, a.state, a.planId], [true, "granted", null]);
});

test("sandbox gateway only in an isolated environment — never next to a real database in production", () => {
  assert.equal(sandboxAllowed({ NODE_ENV: "production", PAYMENT_SANDBOX_SECRET: "s", DATABASE_URL: "postgres://x" }), false);
  assert.equal(sandboxAllowed({ NODE_ENV: "production", PAYMENT_SANDBOX_SECRET: "s", PAYMENT_SANDBOX_ALLOW_PRODUCTION: "true", DATABASE_URL: "postgres://x" }), false);
  assert.equal(sandboxAllowed({ NODE_ENV: "development", PAYMENT_SANDBOX_SECRET: "s", DATABASE_URL: "postgres://x" }), false);
  assert.equal(sandboxAllowed({ NODE_ENV: "development", PAYMENT_SANDBOX_SECRET: "s" }), true);
  assert.equal(sandboxAllowed({ NODE_ENV: "production", PAYMENT_SANDBOX_SECRET: "s", LASTRO_ALLOW_EMBEDDED_DB: "true" }), true);
  assert.equal(sandboxAllowed({ NODE_ENV: "development" }), false);
});

/* ------------------------------------ Centralis ------------------------------------ */

test("Centralis: link → sign-up → pay later → return within the window → purchase attributed, value in reais", async () => {
  const db = await freshDb();
  const config = testConfig();
  const joao = await newUser(db, config, "João");
  await promote(db, config, joao, "JOAO");
  const b = await browser(db, config);
  const clickedAt = new Date(Date.now() - 10 * DAY);
  await landWithRef(db, config, b, "JOAO", clickedAt);
  const maria = await newUser(db, config, "Maria", undefined, b.visitorId);
  await deferCheckout(db, maria);
  assert.equal((await outbox(db, "purchase")).length, 0);
  assert.equal((await outbox(db, "signup")).filter((e) => (e.payload as { user: { external_user_id: string } }).user.external_user_id === maria).length, 1);

  // Comes back later from another device (no visitor cookie): the account carries the attribution.
  const { orderId } = await openOrder(db, config, maria, "vitalicio");
  const [o] = await db.query<{ affiliate_code: string }>(`select affiliate_code from lastro.orders where id = $1`, [orderId]);
  assert.equal(o.affiliate_code, "JOAO");
  await handlePaymentEvent(db, config, "sandbox", approve(orderId));
  const [purchase] = await outbox(db, "purchase");
  const v1 = toCentralisV1(purchase.payload as unknown as Envelope);
  assert.equal(v1.type, "purchase");
  assert.equal(v1.data?.amount, 99.9); // never 9990
  assert.equal(v1.data?.currency, "BRL");
  assert.equal(v1.data?.affiliate_code, "JOAO");
  assert.equal(v1.data?.plan, "vitalicio");
});

test("Centralis: outside the attribution window the purchase is direct; a direct buyer never gets an affiliate", async () => {
  const db = await freshDb();
  const config = testConfig();
  const joao = await newUser(db, config, "João");
  await promote(db, config, joao, "JOAO");
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO", new Date(Date.now() - 31 * DAY));
  const late = await newUser(db, config, "Tardio", undefined, b.visitorId);
  await buy(db, config, late, { visitorId: b.visitorId });
  const direct = await newUser(db, config, "Direto");
  await buy(db, config, direct);
  const affiliates = (await outbox(db, "purchase")).map((e) => (e.payload as { affiliate: unknown }).affiliate);
  assert.deepEqual(affiliates, [null, null]);
});

test("Centralis: no CPF, phone typed at checkout or card data in any event or order row", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  const billing = validateBilling({ name: "Maria Souza", cpf: "529.982.247-25", phone: "(21) 99876-5432", email: "" }, "m@x.com");
  assert.ok(billing.ok);
  const { orderId } = await openOrder(db, config, u, "vitalicio");
  await handlePaymentEvent(db, config, "sandbox", approve(orderId));
  const everything = JSON.stringify([
    await db.query(`select payload from lastro.centralis_outbox`),
    await db.query(`select * from lastro.orders`),
    await db.query(`select * from lastro.charges`),
    await db.query(`select * from lastro.access_entitlements`),
  ]);
  for (const secret of ["52998224725", "529.982.247-25", "+5521998765432", "cvv", "card_number"]) assert.equal(everything.includes(secret), false, secret);
});

test("Centralis offline: the buyer keeps access; the purchase waits in the outbox with the same event id", async () => {
  const db = await freshDb();
  const config = testConfig();
  const u = await newUser(db, config);
  await buy(db, config, u);
  const [p] = await outbox(db, "purchase");
  assert.equal(p.status, "pending");
  assert.equal((await access(db, u)).active, true);
});
