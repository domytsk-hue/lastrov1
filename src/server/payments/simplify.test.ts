import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { freshDb, newUser, outbox, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { getAccess, HOLDINGS } from "../access/entitlements.ts";
import { attachCheckout, createOrder, orderStatus } from "./checkout.ts";
import { handlePaymentEvent } from "./orders.ts";
import { createSimplifyProvider, simplifyConfig, toMinor, webhookToken, type SimplifyConfig } from "./simplify.ts";
import { getPaymentProvider } from "./registry.ts";
import type { PaymentProvider } from "./provider.ts";

const WSECRET = "lastro_simplify_webhook_secret_0123456789";
const ENV = { SIMPLIFY_CLIENT_ID: "cid_test", SIMPLIFY_CLIENT_SECRET: "csecret_test", SIMPLIFY_WEBHOOK_SECRET: WSECRET };
const env = (over: Record<string, string> = {}) => ({ ...ENV, ...over }) as unknown as NodeJS.ProcessEnv;
const PIX = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406099.905802BR5913LASTRO6009SAO PAULO62070503***6304ABCD";

/** A fake Simplify API, answering like the documented example. */
function fakeApi(over: (body: Record<string, unknown>) => Record<string, unknown> = () => ({})) {
  const calls: { path: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));
    calls.push({ path: url.pathname, headers, body });
    if (headers.get("client-secret") !== ENV.SIMPLIFY_CLIENT_SECRET) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    return new Response(JSON.stringify({ internal_id: `TXN_${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`, external_id: body.external_id, status: "pending", qrcode: PIX, amount: body.amount.toFixed(2), ...over(body) }), { status: 201 });
  }) as typeof fetch;
  return { calls, impl };
}

const provider = (impl: typeof fetch) => createSimplifyProvider(simplifyConfig(env()) as SimplifyConfig, impl);
const CUSTOMER = (userId: string) => ({ userId, name: "Maria Souza", email: "maria@exemplo.com", phone: "+5511987654321", document: "52998224725" });

async function checkout(db: Db, c: CentralisConfig, p: PaymentProvider, userId: string, plan = "vitalicio") {
  const r = await createOrder(db, c, { userId, planId: plan, method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: p });
  if (!r.ok) throw new Error(r.error);
  const result = await p.createCheckout({ orderId: r.order.id, plan: { id: plan, name: plan, amountMinor: r.plan.amount_minor, currency: "BRL", billing: plan === "mensal" ? "monthly" : "one_time" }, method: "pix", customer: CUSTOMER(userId), returnUrl: `https://www.lastrofinance.com.br/checkout?pedido=${r.order.id}` });
  await attachCheckout(db, r.order.id, result);
  return { orderId: r.order.id, txId: result.providerPaymentId as string, result };
}

/** A notification exactly as Simplify sends it, to the URL Lastro gave for that order. */
function notify(p: PaymentProvider, orderId: string, body: Record<string, unknown>, token = webhookToken(WSECRET, orderId)) {
  const url = new URL(`https://www.lastrofinance.com.br/api/payments/webhook/simplify?order=${orderId}&token=${token}`);
  return p.parseWebhook(JSON.stringify(body), new Headers(), url);
}
const paid = (orderId: string, txId: string, amount = "79.90") => ({ event: "deposit.paid", internal_id: txId, external_id: orderId, status: "approved", amount, timestamp: new Date().toISOString() });
const access = (db: Db, u: string) => getAccess(db, u, new Date(), HOLDINGS);

test("simplify: only configured with client id, client secret and a long webhook secret", () => {
  assert.ok(simplifyConfig(env()));
  assert.equal(simplifyConfig(env({ SIMPLIFY_WEBHOOK_SECRET: "short" })), null);
  assert.equal(simplifyConfig(env({ SIMPLIFY_CLIENT_SECRET: "" })), null);
  assert.equal(simplifyConfig(env({ SIMPLIFY_API_URL: "http://simplifybr.com/api/v1" })), null);
  const p = getPaymentProvider("simplify", env());
  assert.deepEqual([p?.id, p?.methods, p?.billingFields], ["simplify", ["pix"], undefined]); // default: all four fields
  assert.equal(toMinor("100.50"), 10050);
  assert.equal(toMinor("19.9"), 1990);
  assert.equal(toMinor("1,00"), undefined);
});

test("simplify: the deposit uses the catalog price, our order id and a per-order webhook URL; credentials only in headers", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const api = fakeApi();
  const p = provider(api.impl);
  const { orderId, txId, result } = await checkout(db, c, p, u);
  const call = api.calls[0];
  assert.equal(call.path, "/api/v1/pix/deposit");
  assert.equal(call.headers.get("client-id"), "cid_test");
  assert.deepEqual(call.body.payer, { name: "Maria Souza", email: "maria@exemplo.com", document: "52998224725", phone: "11987654321" });
  assert.equal(call.body.amount, 79.9);
  assert.equal(call.body.external_id, orderId);
  assert.equal(call.body.webhookURL, `https://www.lastrofinance.com.br/api/payments/webhook/simplify?order=${orderId}&token=${webhookToken(WSECRET, orderId)}`);
  assert.ok(!JSON.stringify(call.body).includes("csecret_test"));
  const pix = result.instructions as { kind: string; copyPaste: string; qrCodeImage: string; expiresAt: string };
  assert.deepEqual([pix.kind, pix.copyPaste], ["pix", PIX]);
  assert.ok(pix.qrCodeImage.startsWith("data:image/svg+xml;base64,"));
  assert.ok(new Date(pix.expiresAt).getTime() > Date.now());
  const [row] = await db.query<{ provider_payment_id: string; payment_instructions: { kind: string } }>(`select provider_payment_id, payment_instructions from lastro.orders where id = $1`, [orderId]);
  assert.equal(row.provider_payment_id, txId);
  // The stored instructions are the public Pix code only — no webhook token, no credentials.
  assert.ok(!JSON.stringify(row.payment_instructions).includes(webhookToken(WSECRET, orderId)));
});

test("simplify: a deposit answered for another order or amount, or a 4xx, is an error — never a fake charge", async () => {
  const req = (orderId: string) => ({ orderId, plan: { id: "vitalicio", name: "Vitalício", amountMinor: 7990, currency: "BRL", billing: "one_time" as const }, method: "pix" as const, customer: CUSTOMER("u"), returnUrl: "https://x.test/checkout" });
  await assert.rejects(provider(fakeApi(() => ({ external_id: "other" })).impl).createCheckout(req(randomUUID())), /another order/);
  await assert.rejects(provider(fakeApi(() => ({ amount: "1.00" })).impl).createCheckout(req(randomUUID())), /another amount/);
  await assert.rejects(provider(fakeApi(() => ({ qrcode: null })).impl).createCheckout(req(randomUUID())), /Pix code/);
  const bad = createSimplifyProvider({ ...(simplifyConfig(env()) as SimplifyConfig), clientSecret: "wrong" }, fakeApi().impl);
  await assert.rejects(bad.createCheckout(req(randomUUID())), /401/);
  await assert.rejects(provider(fakeApi().impl).createCheckout({ ...req(randomUUID()), customer: { ...CUSTOMER("u"), phone: null } }), /payer data/);
});

test("simplify: a paid notification with the order's token releases access, exactly once", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const p = provider(fakeApi().impl);
  const { orderId, txId } = await checkout(db, c, p, u);
  assert.equal((await access(db, u)).state, "none");

  const events = await notify(p, orderId, paid(orderId, txId));
  assert.equal(await handlePaymentEvent(db, c, "simplify", events![0]), "applied");
  assert.equal((await access(db, u)).state, "lifetime");
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "approved");
  // Simplify retries up to 3 times: the same notification never counts twice.
  assert.equal(await handlePaymentEvent(db, c, "simplify", (await notify(p, orderId, paid(orderId, txId)))![0]), "duplicate");
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("simplify: forged notifications are refused — no token, wrong token, another order's token, body for another order", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider(fakeApi().impl);
  const a = await checkout(db, c, p, await newUser(db, c));
  const b = await checkout(db, c, p, await newUser(db, c));
  assert.equal(await notify(p, a.orderId, paid(a.orderId, a.txId), ""), null);
  assert.equal(await notify(p, a.orderId, paid(a.orderId, a.txId), "0".repeat(64)), null);
  assert.equal(await notify(p, a.orderId, paid(a.orderId, a.txId), webhookToken(WSECRET, b.orderId)), null);
  // B's valid URL can't be used to pay A.
  assert.equal(await notify(p, b.orderId, paid(a.orderId, a.txId)), null);
  assert.equal(await notify(p, a.orderId, paid(a.orderId, a.txId), webhookToken("another_secret_another_secret_12345", a.orderId)), null);
});

test("simplify: wrong amount goes to a person; 'paid' with a non-approved status is not a payment; cancelled closes the order", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider(fakeApi().impl);
  const u1 = await newUser(db, c);
  const a = await checkout(db, c, p, u1);
  assert.equal(await handlePaymentEvent(db, c, "simplify", (await notify(p, a.orderId, paid(a.orderId, a.txId, "1.00")))![0]), "review");
  assert.equal((await access(db, u1)).state, "none");

  const u2 = await newUser(db, c);
  const b = await checkout(db, c, p, u2);
  const odd = (await notify(p, b.orderId, { ...paid(b.orderId, b.txId), status: "pending" }))![0];
  assert.equal(odd.type, "unhandled");
  assert.equal(await handlePaymentEvent(db, c, "simplify", odd), "review");
  assert.equal((await access(db, u2)).state, "none");

  const u3 = await newUser(db, c);
  const d = await checkout(db, c, p, u3, "mensal");
  const cancelled = (await notify(p, d.orderId, { event: "deposit.cancelled", internal_id: d.txId, external_id: d.orderId, status: "cancelled", amount: "19.90" }))!;
  assert.equal(await handlePaymentEvent(db, c, "simplify", cancelled[0]), "applied");
  assert.equal((await orderStatus(db, c, u3, d.orderId, () => p))?.status, "expired");
});

test("simplify: tolerant of the notification's shape — nested, form-encoded, no external_id — but never of another order", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider(fakeApi().impl);
  const a = await checkout(db, c, p, await newUser(db, c));
  const url = (order: string) => new URL(`https://x.test/api/payments/webhook/simplify?order=${order}&token=${webhookToken(WSECRET, order)}`);
  const nested = await p.parseWebhook(JSON.stringify({ event: "deposit.paid", data: { internal_id: a.txId, external_id: a.orderId, status: "approved", amount: "79.90" } }), new Headers(), url(a.orderId));
  assert.deepEqual([nested?.[0].type, nested?.[0].amountMinor], ["payment.approved", 7990]);
  const form = await p.parseWebhook(`event=deposit.paid&internal_id=${a.txId}&status=approved&amount=99.90`, new Headers(), url(a.orderId));
  assert.deepEqual([form?.[0].type, form?.[0].orderId], ["payment.approved", a.orderId]);
  assert.equal(await p.parseWebhook(JSON.stringify({ event: "deposit.paid", internal_id: a.txId, external_id: randomUUID(), status: "approved", amount: "79.90" }), new Headers(), url(a.orderId)), null);
});

test("manual confirmation: only this order's own charge id and exact amount; never for a gateway Lastro can query", async () => {
  const { confirmManually } = await import("./checkout.ts");
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const p = provider(fakeApi().impl);
  const { orderId, txId } = await checkout(db, c, p, u, "mensal");
  assert.deepEqual(await confirmManually(db, c, { orderId, transactionId: "TXN_OTHER", amountMinor: 1990 }, () => p), { ok: false, error: "transaction_mismatch" });
  assert.deepEqual(await confirmManually(db, c, { orderId, transactionId: txId, amountMinor: 100 }, () => p), { ok: false, error: "amount_mismatch" });
  assert.deepEqual(await confirmManually(db, c, { orderId, transactionId: txId, amountMinor: 1990 }, () => ({ ...p, getPayment: async () => null })), { ok: false, error: "gateway_can_be_queried" });
  assert.equal((await access(db, u)).state, "none");
  assert.deepEqual(await confirmManually(db, c, { orderId, transactionId: txId, amountMinor: 1990 }, () => p), { ok: true, result: "applied" });
  assert.equal((await access(db, u)).state, "monthly");
  assert.equal((await outbox(db, "purchase")).length, 1);
  assert.deepEqual(await confirmManually(db, c, { orderId, transactionId: txId, amountMinor: 1990 }, () => p), { ok: false, error: "not_open" });
  // A late real notification for the same charge is a duplicate, not a second purchase.
  assert.equal(await handlePaymentEvent(db, c, "simplify", (await notify(p, orderId, paid(orderId, txId, "19.90")))![0]), "duplicate");
});
