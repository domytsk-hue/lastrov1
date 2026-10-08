import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { freshDb, newUser, outbox, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { getAccess, HOLDINGS } from "../access/entitlements.ts";
import { attachCheckout, createOrder, orderStatus } from "./checkout.ts";
import { handlePaymentEvent } from "./orders.ts";
import { createMercadoPagoProvider, mercadoPagoConfig, parseCardInput, paymentEvent, verifySignature, type MercadoPagoConfig } from "./mercadopago.ts";
import { checkoutProviders, getPaymentProvider, providerForMethod } from "./registry.ts";
import type { PaymentProvider } from "./provider.ts";

const SECRET = "mp_webhook_secret_0123456789abcdef";
const ENV = { MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test-access", MERCADOPAGO_PUBLIC_KEY: "APP_USR-test-public", MERCADOPAGO_WEBHOOK_SECRET: SECRET };
const env = (over: Record<string, string> = {}) => ({ ...ENV, ...over }) as unknown as NodeJS.ProcessEnv;
const CARD = { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", issuer_id: "24" };

/** A fake Mercado Pago API: card payments answer with the status `nextStatus`. */
function fakeApi() {
  const payments = new Map<string, Record<string, unknown>>();
  const calls: { method: string; path: string; headers: Headers; body: Record<string, unknown> | null }[] = [];
  let next = 1_000_000_001;
  const state = { nextStatus: "approved" };
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init.method ?? "GET", path: url.pathname, headers, body });
    if (headers.get("authorization") !== `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`) return new Response("{}", { status: 401 });
    if (init.method === "POST" && url.pathname === "/v1/payments") {
      const id = next++;
      const p = { id, status: state.nextStatus, status_detail: "accredited", transaction_amount: body.transaction_amount, currency_id: "BRL", external_reference: body.external_reference, payment_type_id: "credit_card", payment_method_id: body.payment_method_id, date_created: new Date().toISOString(), date_approved: new Date().toISOString(), live_mode: true };
      payments.set(String(id), p);
      return new Response(JSON.stringify(p), { status: 201 });
    }
    const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (m && payments.has(m[1])) return new Response(JSON.stringify(payments.get(m[1])), { status: 200 });
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  }) as typeof fetch;
  return { payments, calls, impl, state, set: (id: string, patch: Record<string, unknown>) => payments.set(id, { ...payments.get(id), ...patch }) };
}

function setup() {
  const api = fakeApi();
  const p = createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, api.impl);
  return { api, p };
}

async function pay(db: Db, c: CentralisConfig, p: PaymentProvider, userId: string, plan = "vitalicio") {
  const r = await createOrder(db, c, { userId, planId: plan, method: "card", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: p });
  if (!r.ok) throw new Error(r.error);
  const result = await p.createCheckout({
    orderId: r.order.id,
    plan: { id: plan, name: plan === "mensal" ? "Mensal" : "Vitalício", amountMinor: r.plan.amount_minor, currency: "BRL", billing: plan === "mensal" ? "monthly" : "one_time" },
    method: "card",
    customer: { userId, name: "Maria Souza Lima", email: "maria@exemplo.com", phone: null, document: "52998224725" },
    card: parseCardInput(CARD),
    returnUrl: "",
  });
  await attachCheckout(db, r.order.id, result);
  return { orderId: r.order.id, paymentId: result.providerPaymentId as string, result };
}

/** A webhook exactly as Mercado Pago signs it. */
function signed(dataId: string, opts: { secret?: string; requestId?: string; ts?: string; type?: string } = {}) {
  const ts = opts.ts ?? String(Date.now());
  const requestId = opts.requestId ?? randomUUID();
  const v1 = createHmac("sha256", opts.secret ?? SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  const headers = new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
  const url = new URL(`https://lastro.test/api/payments/webhook/mercadopago?data.id=${dataId}&type=${opts.type ?? "payment"}`);
  const body = JSON.stringify({ action: "payment.updated", api_version: "v1", data: { id: dataId }, type: opts.type ?? "payment", live_mode: true });
  return { body, headers, url };
}
const deliver = (p: PaymentProvider, w: ReturnType<typeof signed>) => p.parseWebhook(w.body, w.headers, w.url);
const access = (db: Db, u: string) => getAccess(db, u, new Date(), HOLDINGS);

/* ------------------------------------- config ------------------------------------- */

test("mercadopago: only configured with access token, public key and webhook secret", () => {
  assert.ok(mercadoPagoConfig(env()));
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_WEBHOOK_SECRET: "short" })), null);
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_PUBLIC_KEY: "" })), null);
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_API_URL: "http://api.mercadopago.com" })), null);
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_STATEMENT_DESCRIPTOR: "Lastro Finance Ltda!" }))?.statementDescriptor, "Lastro Financ");
  const p = getPaymentProvider("mercadopago", env());
  assert.deepEqual([p?.id, p?.methods, p?.publicKey, p?.billingFields], ["mercadopago", ["card"], "APP_USR-test-public", ["name", "email", "cpf"]]);
});

test("registry: Pix and card each have their own gateway; a missing one just isn't offered", () => {
  const both = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "simplify" });
  assert.equal(providerForMethod("card", both)?.id, "mercadopago");
  assert.equal(providerForMethod("pix", both), null); // Simplify chosen but not configured: Pix isn't offered
  assert.deepEqual(checkoutProviders(both).map((o) => o.method), ["card"]);
  const configured = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "simplify", SIMPLIFY_CLIENT_ID: "id", SIMPLIFY_CLIENT_SECRET: "secret", SIMPLIFY_WEBHOOK_SECRET: "w".repeat(32) });
  assert.deepEqual(checkoutProviders(configured).map((o) => [o.method, o.provider.id]), [["pix", "simplify"], ["card", "mercadopago"]]);
  // A gateway is never used for a method it doesn't take.
  assert.equal(providerForMethod("pix", env({ PAYMENT_PROVIDER_PIX: "mercadopago" })), null);
  assert.deepEqual(checkoutProviders(env()), []);
});

test("mercadopago: only a well-formed card token is accepted — never card data", () => {
  assert.deepEqual(parseCardInput(CARD), { token: CARD.token, paymentMethodId: "master", issuerId: "24" });
  assert.equal(parseCardInput({ ...CARD, token: "5031 4332 1540 6351" }), null);
  assert.equal(parseCardInput({ ...CARD, payment_method_id: "<script>" }), null);
  assert.equal(parseCardInput({ ...CARD, issuer_id: "x" }), null);
  assert.equal(parseCardInput(null), null);
});

test("mercadopago: statuses map conservatively (authorized or in analysis is not money)", () => {
  const ev = (status: string) => paymentEvent({ id: 1, status, transaction_amount: 99.9, currency_id: "BRL" }).type;
  assert.deepEqual(["approved", "in_process", "authorized", "rejected", "refunded", "charged_back", "in_mediation"].map(ev), ["payment.approved", "payment.pending", "payment.pending", "payment.failed", "payment.refunded", "payment.refunded", "unhandled"]);
  const e = paymentEvent({ id: 7, status: "approved", transaction_amount: 19.9, currency_id: "brl", external_reference: "not-a-uuid" });
  assert.deepEqual([e.amountMinor, e.currency, e.orderId], [1990, "BRL", undefined]);
});

/* ------------------------------------ checkout ------------------------------------ */

test("mercadopago: the charge uses the catalog price, the card token and our order id — keys stay on the server", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, result } = await pay(db, c, p, u);
  const call = api.calls[0];
  assert.deepEqual([call.method, call.path], ["POST", "/v1/payments"]);
  assert.equal(call.body?.transaction_amount, 99.9);
  assert.equal(call.body?.token, CARD.token);
  assert.equal(call.body?.installments, 1);
  assert.equal(call.body?.external_reference, orderId);
  assert.deepEqual(call.body?.payer, { email: "maria@exemplo.com", first_name: "Maria", last_name: "Souza Lima", identification: { type: "CPF", number: "52998224725" } });
  assert.match(call.headers.get("x-idempotency-key") ?? "", /^[0-9a-f]{64}$/);
  assert.equal(result.instructions.kind, "awaiting");
  // Nothing card-like or secret is stored on the order.
  const [row] = await db.query<{ payment_instructions: unknown }>(`select payment_instructions from lastro.orders where id = $1`, [orderId]);
  assert.deepEqual(row.payment_instructions, { kind: "awaiting" });
  await assert.rejects(p.createCheckout({ orderId, plan: { id: "vitalicio", name: "", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: "card", customer: null, card: null, returnUrl: "" }));
});

test("mercadopago: an approved card is confirmed by asking Mercado Pago, once — page and webhook alike", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, paymentId } = await pay(db, c, p, u);
  assert.equal((await access(db, u)).state, "none"); // creating the charge releases nothing

  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "approved");
  assert.equal(api.calls.at(-1)?.path, `/v1/payments/${paymentId}`);
  assert.equal((await access(db, u)).state, "lifetime");

  const events = await deliver(p, signed(paymentId));
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", events![0]), "duplicate");
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from lastro.charges where gateway_transaction_id = $1`, [paymentId]);
  assert.equal(n, 1);
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("mercadopago: a refused card closes the order and releases nothing", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  api.state.nextStatus = "rejected";
  const { orderId, paymentId } = await pay(db, c, p, u);
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", (await deliver(p, signed(paymentId)))![0]), "applied");
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "failed");
  assert.equal((await access(db, u)).state, "none");
});

/* ------------------------------------- webhook ------------------------------------- */

test("mercadopago: webhooks without a valid signature are refused before any API call", async () => {
  const { api, p } = setup();
  const w = signed("123");
  assert.equal(await deliver(p, { ...w, headers: new Headers() }), null);
  assert.equal(await deliver(p, signed("123", { secret: "another_secret_0123456789" })), null);
  // Signature over another payment id: replaying it for this one doesn't work.
  assert.equal(await p.parseWebhook(w.body, w.headers, new URL("https://lastro.test/api/payments/webhook/mercadopago?data.id=999&type=payment")), null);
  assert.equal(api.calls.length, 0);
  assert.equal(verifySignature(SECRET, new Headers({ "x-signature": "ts=1,v1=zz" }), "1"), false);
});

test("mercadopago: a signed webhook is still only a pointer — status and amount come from the API", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  api.state.nextStatus = "in_process";
  const { paymentId } = await pay(db, c, p, u);
  const [pending] = (await deliver(p, signed(paymentId)))!;
  assert.equal(pending.type, "payment.pending");
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", pending), "ignored");

  // Approved, but for a different amount than the plan: a person decides.
  api.set(paymentId, { status: "approved", transaction_amount: 1 });
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", (await deliver(p, signed(paymentId)))![0]), "review");
  assert.equal((await access(db, u)).state, "none");

  // Not about a payment, or a payment this account doesn't have: nothing to do.
  assert.deepEqual(await deliver(p, signed("555", { type: "merchant_order" })), []);
  assert.deepEqual(await deliver(p, signed("777777")), []);
});

test("mercadopago: refund and chargeback take the access back", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { paymentId } = await pay(db, c, p, u, "mensal");
  await handlePaymentEvent(db, c, "mercadopago", (await deliver(p, signed(paymentId)))![0]);
  assert.equal((await access(db, u)).state, "monthly");
  api.set(paymentId, { status: "charged_back" });
  const [ev] = (await deliver(p, signed(paymentId)))!;
  assert.deepEqual([ev.type, ev.refundReason], ["payment.refunded", "chargeback"]);
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", ev), "applied");
  assert.equal((await access(db, u)).state, "none");
});

test("mercadopago: an API outage during a webhook throws (Mercado Pago delivers it again)", async () => {
  const p = createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, (async () => new Response("", { status: 503 })) as typeof fetch);
  await assert.rejects(deliver(p, signed("123")));
});
