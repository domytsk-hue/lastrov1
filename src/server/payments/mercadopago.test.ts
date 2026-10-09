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
const ENV = { MERCADOPAGO_ACCESS_TOKEN: "APP_USR-test-access", MERCADOPAGO_PUBLIC_KEY: "APP_USR-test-public", MERCADOPAGO_WEBHOOK_SECRET: SECRET, CHECKOUT_CARD: "on" };
const env = (over: Record<string, string> = {}) => ({ ...ENV, ...over }) as unknown as NodeJS.ProcessEnv;
const PIX_CODE = "00020126580014br.gov.bcb.pix0136mp-pix-test5204000053039865405019.905802BR5913LASTRO6009SAO PAULO62070503***6304ABCD";
const CARD = { token: "ff8080814c11e237014c1ff593b57b4d", payment_method_id: "master", issuer_id: "24" };

/** A fake Mercado Pago API: card payments answer with the status `nextStatus`. */
function fakeApi() {
  const payments = new Map<string, Record<string, unknown>>();
  const calls: { method: string; path: string; headers: Headers; body: Record<string, unknown> | null }[] = [];
  let next = 1_000_000_001;
  const state = { nextStatus: "approved", challenge: false };
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init.method ?? "GET", path: url.pathname, headers, body });
    if (headers.get("authorization") !== `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`) return new Response("{}", { status: 401 });
    if (init.method === "POST" && url.pathname === "/v1/payments") {
      const id = next++;
      const pix = body.payment_method_id === "pix";
      if (!pix && state.challenge && body.three_d_secure_mode) {
        const p = { id, status: "pending", status_detail: "pending_challenge", transaction_amount: body.transaction_amount, currency_id: "BRL", external_reference: body.external_reference, payment_type_id: "credit_card", three_ds_info: { external_resource_url: "https://acs.banco.example/3ds/challenge", creq: "eyJjcmVxIjoidGVzdCJ9" } };
        payments.set(String(id), p);
        return new Response(JSON.stringify(p), { status: 201 });
      }
      const p = {
        id, status: pix ? "pending" : state.nextStatus, status_detail: pix ? "pending_waiting_transfer" : "accredited", transaction_amount: body.transaction_amount, currency_id: "BRL",
        external_reference: body.external_reference, payment_type_id: pix ? "bank_transfer" : "credit_card", payment_method_id: body.payment_method_id,
        date_created: new Date().toISOString(), date_approved: pix ? null : new Date().toISOString(), live_mode: true,
        ...(pix ? { date_of_expiration: body.date_of_expiration, point_of_interaction: { transaction_data: { qr_code: PIX_CODE, qr_code_base64: "iVBOR", ticket_url: "https://www.mercadopago.com.br/payments/x" } } } : {}),
      };
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
  assert.deepEqual([p?.id, p?.methods, p?.publicKey, p?.billingFields], ["mercadopago", ["pix", "card"], "APP_USR-test-public", ["name", "email", "cpf"]]);
});

test("registry: card is paused in the checkout unless CHECKOUT_CARD=on; Pix stays", () => {
  const allMp = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "mercadopago", CHECKOUT_CARD: "" });
  assert.equal(providerForMethod("card", allMp), null);
  assert.deepEqual(checkoutProviders(allMp).map((o) => [o.method, o.provider.id]), [["pix", "mercadopago"]]);
  assert.equal(providerForMethod("card", env({ PAYMENT_PROVIDER: "mercadopago", CHECKOUT_CARD: "off" })), null);
  // The gateway itself stays configured (status checks, webhooks and refunds of card orders).
  assert.equal(getPaymentProvider("mercadopago", allMp)?.methods.includes("card"), true);
  assert.equal(providerForMethod("card", env({ ...allMp, CHECKOUT_CARD: "on" }))?.id, "mercadopago");
});

test("registry: Pix and card each have their own gateway; a missing one just isn't offered", () => {
  const both = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "simplify" });
  assert.equal(providerForMethod("card", both)?.id, "mercadopago");
  assert.equal(providerForMethod("pix", both), null); // Simplify chosen but not configured: Pix isn't offered
  assert.deepEqual(checkoutProviders(both).map((o) => o.method), ["card"]);
  // Both methods on Mercado Pago.
  const allMp = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "mercadopago" });
  assert.deepEqual(checkoutProviders(allMp).map((o) => [o.method, o.provider.id]), [["pix", "mercadopago"], ["card", "mercadopago"]]);
  const configured = env({ PAYMENT_PROVIDER_CARD: "mercadopago", PAYMENT_PROVIDER_PIX: "simplify", SIMPLIFY_CLIENT_ID: "id", SIMPLIFY_CLIENT_SECRET: "secret", SIMPLIFY_WEBHOOK_SECRET: "w".repeat(32) });
  assert.deepEqual(checkoutProviders(configured).map((o) => [o.method, o.provider.id]), [["pix", "simplify"], ["card", "mercadopago"]]);
  // A gateway is never used for a method it doesn't take.
  assert.equal(providerForMethod("pix", env({ PAYMENT_PROVIDER_PIX: "sandbox" })), null);
  assert.deepEqual(checkoutProviders(env()), []);
});

test("mercadopago: only a well-formed card token is accepted — never card data", () => {
  assert.deepEqual(parseCardInput(CARD), { token: CARD.token, paymentMethodId: "master", issuerId: "24", deviceId: null });
  assert.equal(parseCardInput({ ...CARD, device_id: "armor.1a2b3c4d5e6f7a8b9c0d" })?.deviceId, "armor.1a2b3c4d5e6f7a8b9c0d");
  assert.equal(parseCardInput({ ...CARD, device_id: "<script>" })?.deviceId, null);
  assert.equal(parseCardInput({ ...CARD, token: "5031 4332 1540 6351" }), null);
  assert.equal(parseCardInput({ ...CARD, payment_method_id: "<script>" }), null);
  assert.equal(parseCardInput({ ...CARD, issuer_id: "x" }), null);
  assert.equal(parseCardInput(null), null);
});

test("mercadopago: statuses map conservatively (authorized or in analysis is not money)", () => {
  const ev = (status: string) => paymentEvent({ id: 1, status, transaction_amount: 79.9, currency_id: "BRL" }).type;
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
  assert.equal(call.body?.transaction_amount, 79.9);
  assert.equal(call.body?.token, CARD.token);
  assert.equal(call.body?.installments, 1);
  assert.equal(call.body?.external_reference, orderId);
  assert.deepEqual(call.body?.payer, { email: "maria@exemplo.com", first_name: "Maria", last_name: "Souza Lima", identification: { type: "CPF", number: "52998224725" } });
  assert.match(call.headers.get("x-idempotency-key") ?? "", /^[0-9a-f]{64}$/);
  assert.equal(result.instructions.kind, "awaiting");
  // Nothing card-like or secret is stored on the order.
  const [row] = await db.query<{ payment_instructions: unknown }>(`select payment_instructions from lastro.orders where id = $1`, [orderId]);
  assert.deepEqual(row.payment_instructions, { kind: "awaiting" });
  await assert.rejects(p.createCheckout({ orderId, plan: { id: "vitalicio", name: "", amountMinor: 7990, currency: "BRL", billing: "one_time" }, method: "card", customer: null, card: null, returnUrl: "" }));
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

test("mercadopago: a refusal is logged with Mercado Pago's reason, never the token", async () => {
  const p = createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, (async () =>
    new Response(JSON.stringify({ message: "invalid parameters", error: "bad_request", status: 400, cause: [{ code: 2006, description: "Card Token not found" }] }), { status: 400 })) as typeof fetch);
  const err = await p.createCheckout({ orderId: randomUUID(), plan: { id: "mensal", name: "Mensal", amountMinor: 1990, currency: "BRL", billing: "monthly" }, method: "card", customer: null, card: parseCardInput(CARD), returnUrl: "" }).catch((e: Error) => e);
  assert.ok(err instanceof Error);
  assert.match(err.message, /400 bad_request \| invalid parameters \| 2006 Card Token not found/);
  assert.ok(!err.message.includes(CARD.token));
});

/* ------------------------------------- Pix ------------------------------------- */

async function payPix(db: Db, c: CentralisConfig, p: PaymentProvider, userId: string, plan = "mensal") {
  const r = await createOrder(db, c, { userId, planId: plan, method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: p });
  if (!r.ok) throw new Error(r.error);
  const result = await p.createCheckout({
    orderId: r.order.id,
    plan: { id: plan, name: plan === "mensal" ? "Mensal" : "Vitalício", amountMinor: r.plan.amount_minor, currency: "BRL", billing: plan === "mensal" ? "monthly" : "one_time" },
    method: "pix",
    customer: { userId, name: "Maria Souza Lima", email: "maria@exemplo.com", phone: null, document: "52998224725" },
    card: null,
    returnUrl: "",
  });
  await attachCheckout(db, r.order.id, result);
  return { orderId: r.order.id, paymentId: result.providerPaymentId as string, result };
}

test("mercadopago Pix: a Pix charge with the catalog price, our order id and an expiry; QR drawn from Mercado Pago's code", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, result } = await payPix(db, c, p, u);
  const call = api.calls[0];
  assert.equal(call.body?.payment_method_id, "pix");
  assert.equal(call.body?.transaction_amount, 19.9);
  assert.equal(call.body?.external_reference, orderId);
  assert.equal(call.body?.token, undefined);
  assert.deepEqual(call.body?.payer, { email: "maria@exemplo.com", first_name: "Maria", last_name: "Souza Lima", identification: { type: "CPF", number: "52998224725" } });
  assert.match(String(call.body?.date_of_expiration), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-03:00$/);
  const minutes = (Date.parse(String(call.body?.date_of_expiration)) - Date.now()) / 60_000;
  assert.ok(minutes > 30 && minutes < 32, `expiry in ${minutes} min`);
  const pix = result.instructions as { kind: string; copyPaste: string; qrCodeImage: string; expiresAt: string };
  assert.deepEqual([pix.kind, pix.copyPaste], ["pix", PIX_CODE]);
  assert.ok(pix.qrCodeImage.startsWith("data:image/svg+xml;base64,"));
  assert.ok(Date.parse(pix.expiresAt) > Date.now());
});

test("mercadopago Pix: paid → the page's own check confirms it (no webhook needed); the webhook later is a duplicate", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, paymentId } = await payPix(db, c, p, u);
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "pending");
  assert.equal((await access(db, u)).state, "none");
  api.set(paymentId, { status: "approved", status_detail: "accredited", date_approved: new Date().toISOString() });
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "approved");
  assert.equal((await access(db, u)).state, "monthly");
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", (await deliver(p, signed(paymentId)))![0]), "duplicate");
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("mercadopago Pix: an expired Pix closes the order as expired, nothing released", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, paymentId } = await payPix(db, c, p, u);
  api.set(paymentId, { status: "cancelled", status_detail: "expired" });
  const [ev] = (await deliver(p, signed(paymentId)))!;
  assert.equal(ev.type, "payment.expired");
  assert.equal(await handlePaymentEvent(db, c, "mercadopago", ev), "applied");
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "expired");
  assert.equal((await access(db, u)).state, "none");
});

test("mercadopago Pix: a 4xx or a Pix without code is an error, never a fake charge", async () => {
  const req = { orderId: randomUUID(), plan: { id: "mensal", name: "Mensal", amountMinor: 1990, currency: "BRL", billing: "monthly" as const }, method: "pix" as const, customer: { userId: "u", name: "Maria", email: "maria@exemplo.com", phone: null, document: "52998224725" }, card: null, returnUrl: "" };
  const refusing = createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, (async () => new Response(JSON.stringify({ message: "Financial Identity Use Case was not found", error: "bad_request", status: 400, cause: [{ code: 13253, description: "Collector user without key enabled for QR render" }] }), { status: 400 })) as typeof fetch);
  const err = await refusing.createCheckout(req).catch((e: Error) => e);
  assert.ok(err instanceof Error && /400 .*13253 Collector user without key enabled/.test(err.message), String(err));
  const noCode = createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, (async () => new Response(JSON.stringify({ id: 5, status: "pending" }), { status: 201 })) as typeof fetch);
  await assert.rejects(noCode.createCheckout(req), /without id or code/);
  await assert.rejects(createMercadoPagoProvider(mercadoPagoConfig(env()) as MercadoPagoConfig, fakeApi().impl).createCheckout({ ...req, customer: null }), /e-mail required/);
});

test("mercadopago: anti-fraud signals — device id header and buyer details go with the card charge", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const r = await createOrder(db, c, { userId: u, planId: "mensal", method: "card", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: p });
  if (!r.ok) throw new Error(r.error);
  await p.createCheckout({
    orderId: r.order.id,
    plan: { id: "mensal", name: "Mensal", amountMinor: 1990, currency: "BRL", billing: "monthly" },
    method: "card",
    customer: { userId: u, name: "Maria Souza Lima", email: "maria@exemplo.com", phone: "+5511987654321", document: "52998224725" },
    card: parseCardInput({ ...CARD, device_id: "armor.1a2b3c4d5e6f7a8b9c0d" }),
    returnUrl: "",
  });
  const call = api.calls[0];
  assert.equal(call.headers.get("x-meli-session-id"), "armor.1a2b3c4d5e6f7a8b9c0d");
  const info = call.body?.additional_info as { payer: unknown; items: { category_id: string }[] };
  assert.deepEqual(info.payer, { first_name: "Maria", last_name: "Souza Lima", phone: { area_code: "11", number: "987654321" } });
  assert.equal(info.items[0].category_id, "services");
});

/* ----------------------------------- 3-D Secure ----------------------------------- */

test("mercadopago 3DS: card charges ask for 3-D Secure (optional by default; configurable; off removes it)", async () => {
  assert.equal(mercadoPagoConfig(env())?.threeDSecure, "optional");
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_3DS: "mandatory" }))?.threeDSecure, "mandatory");
  assert.equal(mercadoPagoConfig(env({ MERCADOPAGO_3DS: "off" }))?.threeDSecure, "off");
  const db = await freshDb();
  const c = testConfig();
  const { api, p } = setup();
  await pay(db, c, p, await newUser(db, c));
  assert.equal(api.calls[0].body?.three_d_secure_mode, "optional");
  const off = fakeApi();
  const pOff = createMercadoPagoProvider(mercadoPagoConfig(env({ MERCADOPAGO_3DS: "off" })) as MercadoPagoConfig, off.impl);
  await pay(db, c, pOff, await newUser(db, c));
  assert.equal(off.calls[0].body?.three_d_secure_mode, undefined);
});

test("mercadopago 3DS: a bank challenge is shown on Lastro's page; after it, Mercado Pago's answer decides", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  api.state.challenge = true;
  const { orderId, paymentId, result } = await pay(db, c, p, u);
  assert.deepEqual(result.instructions, { kind: "challenge", url: "https://acs.banco.example/3ds/challenge", creq: "eyJjcmVxIjoidGVzdCJ9" });
  // While the buyer is confirming, nothing is released.
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "pending");
  assert.equal((await access(db, u)).state, "none");
  // The bank confirmed: Mercado Pago approves it.
  api.set(paymentId, { status: "approved", status_detail: "accredited", date_approved: new Date().toISOString() });
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "approved");
  assert.equal((await access(db, u)).state, "lifetime");
});

test("mercadopago 3DS: a challenge the buyer fails is a refusal, nothing released", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  api.state.challenge = true;
  const { orderId, paymentId } = await pay(db, c, p, u);
  api.set(paymentId, { status: "rejected", status_detail: "cc_rejected_3ds_challenge" });
  assert.equal((await orderStatus(db, c, u, orderId, () => p))?.status, "failed");
  assert.equal((await access(db, u)).state, "none");
});
