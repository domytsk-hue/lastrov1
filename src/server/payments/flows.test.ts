import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { action, browser, buy, freshDb, landWithRef, newUser, openOrder, outbox, promote, testConfig } from "../test-helpers.ts";
import { handleCentralisAction } from "../centralis/actions.ts";
import { flushOutbox } from "../centralis/outbox.ts";
import { findForbiddenKeys } from "../centralis/serialize.ts";
import { myAffiliate } from "../affiliates/me.ts";
import { signIn, signUp, userForSessionToken } from "../auth/accounts.ts";
import { handlePaymentEvent } from "./orders.ts";
import { createSandboxProvider, signSandboxWebhook } from "./sandbox.ts";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
type Purchase = { order: { amount_minor: number; currency: string; plan_id: string; plan_name: string; kind: string; external_order_id: string }; affiliate: { code: string; centralis_affiliate_id: string } | null };

async function joaoAffiliate(db: Awaited<ReturnType<typeof freshDb>>, config = testConfig()) {
  const joao = await newUser(db, config, "João");
  const r = await promote(db, config, joao, "JOAO");
  return { joao, centralisId: r.body.result?.centralis_affiliate_id as string };
}

/* ------------------------------------- accounts ------------------------------------- */

test("accounts: sign up, duplicate rejected, wrong password rejected, session token not stored in clear", async () => {
  const db = await freshDb();
  const config = testConfig();
  const r = await signUp(db, config, { name: "Maria", email: "Maria@Exemplo.com", phone: "(11) 98765-4321", password: "senhaForte123" }, { visitorId: null });
  assert.ok(r.ok);
  const [row] = await db.query<{ email: string; phone: string }>(`select email, phone from lastro.users where id = $1`, [r.value.session.userId]);
  assert.deepEqual(row, { email: "maria@exemplo.com", phone: "+5511987654321" });
  // Both are required, and each one is unique.
  assert.equal((await signUp(db, config, { name: "Sem Email", email: "", phone: "11912345678", password: "senhaForte123" }, { visitorId: null })).ok, false);
  assert.equal((await signUp(db, config, { name: "Sem Fone", email: "semfone@exemplo.com", phone: "", password: "senhaForte123" }, { visitorId: null })).ok, false);
  const dup = await signUp(db, config, { name: "Outra", email: "outra@exemplo.com", phone: "11987654321", password: "senhaForte123" }, { visitorId: null });
  assert.deepEqual(dup, { ok: false, error: "Já existe uma conta com esse telefone. Que tal entrar?" });
  const dupEmail = await signUp(db, config, { name: "Outra", email: "maria@exemplo.com", phone: "11912345678", password: "senhaForte123" }, { visitorId: null });
  assert.deepEqual(dupEmail, { ok: false, error: "Já existe uma conta com esse e-mail. Que tal entrar?" });
  // Either one signs in.
  assert.ok((await signIn(db, config, { identifier: "maria@exemplo.com", password: "senhaForte123" }, { visitorId: null })).ok);
  assert.equal((await signIn(db, config, { identifier: "+55 11 98765-4321", password: "errada123" }, { visitorId: null })).ok, false);
  const ok = await signIn(db, config, { identifier: "11987654321", password: "senhaForte123" }, { visitorId: null });
  assert.ok(ok.ok);
  assert.equal((await userForSessionToken(db, ok.value.token))?.id, r.value.session.userId);
  const stored = await db.query<{ id: string }>(`select id from lastro.sessions`);
  assert.ok(stored.every((s) => s.id !== ok.value.token && s.id.length === 64));
});

/* -------------------------------- clicks & attribution -------------------------------- */

test("click without purchase: visits +1, purchases unchanged; Centralis gets a click, no purchase", async () => {
  const db = await freshDb();
  const config = testConfig();
  const { joao } = await joaoAffiliate(db);
  const maria = await browser(db, config);
  assert.deepEqual((await landWithRef(db, config, maria, "joao")).recorded, true);
  // a refresh in the same session is not a new visit
  assert.deepEqual(await landWithRef(db, config, maria, "JOAO"), { recorded: false, reason: "same_session" });

  const s = (await myAffiliate(db, joao, "https://x"))!.stats;
  assert.equal(s.visits, 1);
  assert.equal(s.unique_visitors, 1);
  assert.equal(s.purchases, 0);
  const click = (await outbox(db, "affiliate.click"))[0].payload as { affiliate: { code: string }; visitor_id: string; session_id: string };
  assert.equal(click.affiliate.code, "JOAO");
  assert.equal(click.visitor_id, maria.visitorId);
  assert.equal(click.session_id, maria.sessionId);
  assert.equal((await outbox(db, "purchase")).length, 0);
});

test("unknown or suspended codes are not counted", async () => {
  const db = await freshDb();
  const config = testConfig();
  const { joao, centralisId } = await joaoAffiliate(db);
  const b = await browser(db, config);
  assert.deepEqual(await landWithRef(db, config, b, "NINGUEM"), { recorded: false, reason: "unknown_code" });
  await handleCentralisAction(db, config, JSON.stringify(action(config, "affiliate.suspend", { external_user_id: joao, centralis_affiliate_id: centralisId })));
  assert.deepEqual(await landWithRef(db, config, b, "JOAO"), { recorded: false, reason: "inactive" });
});

test("click + purchase: Maria enters via JOAO on day 1, returns directly on day 4 and buys R$ 99,90", async () => {
  const db = await freshDb();
  const config = testConfig();
  const { joao, centralisId } = await joaoAffiliate(db);
  const maria = await browser(db, config);
  await landWithRef(db, config, maria, "JOAO", daysAgo(3));
  const mariaId = await newUser(db, config, "Maria", undefined, maria.visitorId);

  const { result } = await buy(db, config, mariaId, { visitorId: maria.visitorId });
  assert.equal(result, "applied");

  const [p] = await outbox(db, "purchase");
  const purchase = p.payload as unknown as Purchase;
  assert.equal(purchase.order.amount_minor, 9990);
  assert.equal(purchase.order.currency, "BRL");
  assert.equal(purchase.order.plan_id, "vitalicio");
  assert.deepEqual(purchase.affiliate, { centralis_affiliate_id: centralisId, code: "JOAO" });
  // Lastro reports the amount; it never computes commission.
  assert.ok(!JSON.stringify(purchase).includes("commission"));

  const signup = (await outbox(db, "signup"))[1].payload as { affiliate: { code: string } | null };
  assert.equal(signup.affiliate?.code, "JOAO");
  const [u] = await db.query<{ plan_id: string }>(`select plan_id from lastro.users where id = $1`, [mariaId]);
  assert.equal(u.plan_id, "vitalicio");
  const s = (await myAffiliate(db, joao, "https://x"))!.stats;
  assert.equal(s.purchases, 1);
  assert.equal(s.signups, 1);
  assert.equal(s.revenue_generated_minor, 9990);
  assert.equal(s.commission_generated_minor, null);
});

test("attribution window: a click 31 days before the purchase no longer counts", async () => {
  const db = await freshDb();
  const config = testConfig();
  await joaoAffiliate(db);
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO", daysAgo(31));
  const buyer = await newUser(db, config, "Carla", undefined, b.visitorId);
  await buy(db, config, buyer, { visitorId: b.visitorId });
  assert.equal(((await outbox(db, "purchase"))[0].payload as unknown as Purchase).affiliate, null);
});

test("last click wins", async () => {
  const db = await freshDb();
  const config = testConfig();
  await joaoAffiliate(db);
  const ana = await newUser(db, config, "Ana");
  await promote(db, config, ana, "ANA");
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO", daysAgo(5));
  const b2 = { ...b, sessionId: (await browser(db, config)).sessionId };
  await db.query(`update lastro.visitor_sessions set visitor_id = $1 where id = $2`, [b.visitorId, b2.sessionId]);
  await landWithRef(db, config, b2, "ANA", daysAgo(2));
  const buyer = await newUser(db, config, "Bruno", undefined, b.visitorId);
  await buy(db, config, buyer, { visitorId: b.visitorId });
  assert.equal(((await outbox(db, "purchase"))[0].payload as unknown as Purchase).affiliate?.code, "ANA");
});

/* ------------------------------------- payments ------------------------------------- */

test("direct purchase is reported with affiliate = null", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config, "Dani");
  await buy(db, config, userId);
  const p = (await outbox(db, "purchase"))[0].payload as unknown as Purchase;
  assert.equal(p.affiliate, null);
  assert.equal(p.order.amount_minor, 9990);
});

test("checkout started or payment pending is not a purchase", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config, "Eva");
  const started = await openOrder(db, config, userId, "vitalicio");
  assert.equal((await outbox(db, "checkout.started")).length, 1);
  const r = await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_p", type: "payment.pending", orderId: started.orderId, transactionId: "tx_p", occurredAt: new Date() });
  assert.equal(r, "ignored");
  assert.equal((await outbox(db, "purchase")).length, 0);
  const [u] = await db.query<{ plan_id: string | null }>(`select plan_id from lastro.users where id = $1`, [userId]);
  assert.equal(u.plan_id, null);
  const [o] = await db.query<{ status: string }>(`select status from lastro.orders`);
  assert.equal(o.status, "pending");
});

test("duplicate webhook (same event, or same transaction under a new event id) creates one purchase", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config, "Fábio");
  const started = await openOrder(db, config, userId, "vitalicio");
  const ev = { providerEventId: "evt_1", type: "payment.approved" as const, orderId: started.orderId, transactionId: "tx_1", amountMinor: 9990, currency: "BRL", occurredAt: new Date() };
  assert.equal(await handlePaymentEvent(db, config, "sandbox", ev), "applied");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", ev), "duplicate");
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { ...ev, providerEventId: "evt_2" }), "duplicate");
  assert.equal((await db.query(`select id from lastro.charges`)).length, 1);
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("sandbox webhooks must be signed; nothing but a verified webhook approves an order", async () => {
  const provider = createSandboxProvider("whsec_test");
  const body = JSON.stringify({ id: "evt_x", type: "payment.approved", order_id: randomUUID(), transaction_id: "tx", amount_minor: 9990, currency: "BRL" });
  assert.equal(await provider.parseWebhook(body, new Headers({ "x-sandbox-signature": "0".repeat(64) }), new URL("https://x/")), null);
  assert.equal(await provider.parseWebhook(body, new Headers(), new URL("https://x/")), null);
  const events = await provider.parseWebhook(body, new Headers({ "x-sandbox-signature": signSandboxWebhook("whsec_test", body) }), new URL("https://x/"));
  assert.equal(events?.[0].amountMinor, 9990);
});

test("Centralis offline during payment: access released, order approved, purchase waits in the outbox", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config, "Gabi");
  await buy(db, config, userId);
  const offline = { sendEvents: async () => ({ ok: false as const, error: { code: "network" as const, retryable: true, message: "down" } }) };
  await flushOutbox(db, config, offline, 100);
  const [u] = await db.query<{ plan_id: string }>(`select plan_id from lastro.users where id = $1`, [userId]);
  assert.equal(u.plan_id, "vitalicio");
  const [o] = await db.query<{ status: string }>(`select status from lastro.orders`);
  assert.equal(o.status, "approved");
  assert.equal((await outbox(db, "purchase"))[0].status, "pending");

  await db.query(`update lastro.centralis_outbox set next_retry_at = now()`);
  const received: { event: string }[] = [];
  await flushOutbox(db, config, { sendEvents: async (e) => (received.push(...e), { ok: true, outcomes: Object.fromEntries(e.map((x) => [x.event_id, { status: "sent" as const }])) }) }, 100);
  assert.ok(received.some((e) => e.event === "purchase"));
  assert.equal((await outbox(db, "purchase"))[0].status, "sent");
});

test("refund references the original purchase and removes the plan", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config, "Hugo");
  const { orderId, transactionId } = await buy(db, config, userId);
  const r = await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_r", type: "payment.refunded", refundedTransactionId: transactionId, amountMinor: 9990, currency: "BRL", occurredAt: new Date() });
  assert.equal(r, "applied");
  const refund = (await outbox(db, "refund"))[0].payload as { original: { external_order_id: string; gateway_transaction_id: string }; refund: { amount_minor: number } };
  assert.equal(refund.original.external_order_id, orderId);
  assert.equal(refund.original.gateway_transaction_id, transactionId);
  assert.equal(refund.refund.amount_minor, 9990);
  const [u] = await db.query<{ plan_id: string | null }>(`select plan_id from lastro.users where id = $1`, [userId]);
  assert.equal(u.plan_id, null);
  assert.equal(await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_r2", type: "payment.refunded", refundedTransactionId: transactionId, occurredAt: new Date() }), "duplicate");
});

test("monthly plan: subscription created, renewal is its own purchase with the original attribution, failure and cancel reported", async () => {
  const db = await freshDb();
  const config = testConfig();
  await joaoAffiliate(db);
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const userId = await newUser(db, config, "Iris", undefined, b.visitorId);
  await buy(db, config, userId, { plan: "mensal", visitorId: b.visitorId });
  const [sub] = await db.query<{ provider_subscription_id: string }>(`select provider_subscription_id from lastro.subscriptions`);
  assert.equal((await outbox(db, "subscription.created")).length, 1);

  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_f", type: "payment.failed", providerSubscriptionId: sub.provider_subscription_id, occurredAt: new Date() });
  assert.equal((await outbox(db, "payment.failed")).length, 1);
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_rn", type: "subscription.renewed", providerSubscriptionId: sub.provider_subscription_id, transactionId: "tx_rn", amountMinor: 1990, currency: "BRL", occurredAt: new Date() });
  const purchases = (await outbox(db, "purchase")).map((e) => e.payload as unknown as Purchase);
  assert.deepEqual(purchases.map((p) => [p.order.kind, p.order.amount_minor, p.affiliate?.code]), [["initial", 1990, "JOAO"], ["renewal", 1990, "JOAO"]]);
  assert.equal((await outbox(db, "subscription.renewed")).length, 1);

  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "evt_c", type: "subscription.cancelled", providerSubscriptionId: sub.provider_subscription_id, occurredAt: new Date() });
  assert.equal((await outbox(db, "subscription.cancelled")).length, 1);
  const [u] = await db.query<{ subscription_status: string }>(`select subscription_status from lastro.users where id = $1`, [userId]);
  assert.equal(u.subscription_status, "cancelled");
});

/* -------------------------------- the whole story (§95) -------------------------------- */

test("João: 100 visitors, 3 purchases of R$ 99,90 → R$ 299,70 reported; Centralis' commission shows on his dashboard", async () => {
  const db = await freshDb();
  const config = testConfig();
  const { joao, centralisId } = await joaoAffiliate(db);
  const me0 = await myAffiliate(db, joao, "https://lastro.app");
  assert.deepEqual([me0?.link, me0?.stats.visits, me0?.stats.purchases], ["https://lastro.app/?ref=JOAO", 0, 0]);

  const visitors = [];
  for (let i = 0; i < 100; i++) {
    const b = await browser(db, config);
    await landWithRef(db, config, b, "JOAO");
    visitors.push(b);
  }
  for (let i = 0; i < 3; i++) {
    const buyer = await newUser(db, config, `Comprador ${String.fromCharCode(65 + i)}`, undefined, visitors[i].visitorId);
    await buy(db, config, buyer, { visitorId: visitors[i].visitorId });
  }

  const purchases = (await outbox(db, "purchase")).map((e) => e.payload as unknown as Purchase);
  assert.equal(purchases.length, 3);
  assert.ok(purchases.every((p) => p.order.amount_minor === 9990 && p.order.currency === "BRL" && p.affiliate?.code === "JOAO"));
  assert.equal(purchases.reduce((s, p) => s + p.order.amount_minor, 0), 29970);
  assert.equal((await outbox(db, "affiliate.click")).length, 100);

  // Centralis computes 20% of 29970 = 5994 and pushes it back.
  const sync = await handleCentralisAction(db, config, JSON.stringify(action(config, "affiliate.stats_sync", { centralis_affiliate_id: centralisId, stats: { commission_generated_minor: 5994, pending_commission_minor: 5994, paid_commission_minor: 0, currency: "BRL" } })));
  assert.equal(sync.body.success, true);

  const s = (await myAffiliate(db, joao, "https://lastro.app"))!.stats;
  assert.equal(s.visits, 100);
  assert.equal(s.unique_visitors, 100);
  assert.equal(s.purchases, 3);
  assert.equal(s.revenue_generated_minor, 29970);
  assert.equal(s.conversion_rate, 0.03);
  assert.equal(s.commission_generated_minor, 5994);
  assert.equal(s.pending_commission_minor, 5994);

  // An affiliate's view is resolved from their own user id only.
  const stranger = await newUser(db, config, "Estranho");
  assert.equal(await myAffiliate(db, stranger, "https://lastro.app"), null);
});

/* ---------------------------- nothing forbidden ever leaves ---------------------------- */

test("no Centralis payload contains CPF, passwords, hashes, salts, tokens or card data", async () => {
  const db = await freshDb();
  const config = testConfig();
  const { joao, centralisId } = await joaoAffiliate(db);
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const buyer = await newUser(db, config, "Paula", "paula@exemplo.com", b.visitorId, "(21) 99876-5432");
  const { transactionId } = await buy(db, config, buyer, { visitorId: b.visitorId });
  await buy(db, config, joao, { plan: "mensal" });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "e_r", type: "payment.refunded", refundedTransactionId: transactionId, occurredAt: new Date() });
  await handleCentralisAction(db, config, JSON.stringify(action(config, "affiliate.update", { centralis_affiliate_id: centralisId, affiliate: { commission_rate: 0.25 } })));
  await handleCentralisAction(db, config, JSON.stringify(action(config, "resync.user", { external_user_id: buyer })));

  const secrets = await db.query<{ password_hash: string; password_salt: string }>(`select password_hash, password_salt from lastro.users`);
  const sessions = await db.query<{ id: string }>(`select id from lastro.sessions`);
  const all = await outbox(db);
  assert.ok(all.length > 15);
  for (const e of all) {
    assert.deepEqual(findForbiddenKeys(e.payload), [], `${e.event} has forbidden keys`);
    const text = JSON.stringify(e.payload);
    for (const s of secrets) assert.ok(!text.includes(s.password_hash) && !text.includes(s.password_salt), `${e.event} leaks a credential`);
    for (const s of sessions) assert.ok(!text.includes(s.id), `${e.event} leaks a session id`);
    assert.ok(!/senhaForte123/.test(text), `${e.event} leaks a password`);
    assert.equal(e.payload.schema_version, "1.0");
    assert.equal(e.payload.product_id, config.productId);
    assert.match(String(e.payload.event_id), /^[0-9a-f-]{36}$/);
    assert.match(String(e.payload.timestamp), /Z$/);
  }
});
