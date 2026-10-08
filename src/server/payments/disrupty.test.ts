import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { freshDb, newUser, outbox, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { getAccess, HOLDINGS } from "../access/entitlements.ts";
import { attachCheckout, createOrder, orderStatus } from "./checkout.ts";
import { handlePaymentEvent } from "./orders.ts";
import { createDisruptyProvider, disruptyConfig, toMinor, webhookSaleId, type DisruptyConfig } from "./disrupty.ts";
import { getPaymentProvider } from "./registry.ts";
import type { PaymentProvider } from "./provider.ts";

const ENV = {
  DISRUPTY_PUBLIC_KEY: "dsrp_pub_test",
  DISRUPTY_PRIVATE_KEY: "dsrp_priv_test",
  DISRUPTY_OFFER_ID_MENSAL: "101",
  DISRUPTY_OFFER_ID_VITALICIO: "202",
};
const env = (over: Record<string, string> = {}) => ({ ...ENV, ...over }) as unknown as NodeJS.ProcessEnv;
const PIX = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406099.905802BR5913LASTRO6009SAO PAULO62070503***6304ABCD";

/** A fake Disrupty API: records every call, answers from `sales`. */
function fakeApi() {
  const sales = new Map<string, Record<string, unknown>>();
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  let next = 1;
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init.method ?? "GET", path: url.pathname, headers, body });
    if (headers.get("x-api-private-key") !== ENV.DISRUPTY_PRIVATE_KEY) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    if (init.method === "POST" && url.pathname === "/api/sales") {
      const id = `sale_${next++}`;
      const sale = { id, status: "PENDENTE", amount: body.amount, paymentMethod: "PIX", payment: { pix: { key: PIX, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } } };
      sales.set(id, sale);
      return new Response(JSON.stringify(sale), { status: 201 });
    }
    const m = url.pathname.match(/^\/api\/sales\/([^/]+)$/);
    if (m && sales.has(m[1])) return new Response(JSON.stringify(sales.get(m[1])), { status: 200 });
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }) as typeof fetch;
  return { sales, calls, impl, set: (id: string, patch: Record<string, unknown>) => sales.set(id, { ...sales.get(id), ...patch }) };
}

function setup(over: Record<string, string> = {}) {
  const api = fakeApi();
  const p = createDisruptyProvider(disruptyConfig(env(over)) as DisruptyConfig, api.impl);
  return { api, p };
}

async function checkout(db: Db, c: CentralisConfig, p: PaymentProvider, userId: string, plan = "vitalicio") {
  const r = await createOrder(db, c, { userId, planId: plan, method: "pix", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: p });
  if (!r.ok) throw new Error(r.error);
  const amountMinor = r.plan.amount_minor;
  const result = await p.createCheckout({ orderId: r.order.id, plan: { id: plan, name: plan, amountMinor, currency: "BRL", billing: plan === "mensal" ? "monthly" : "one_time" }, method: "pix", customer: { userId, name: "Maria Souza", email: "maria@exemplo.com", phone: null, document: null }, returnUrl: "" });
  await attachCheckout(db, r.order.id, result);
  return { orderId: r.order.id, saleId: result.providerPaymentId as string, result };
}

const hook = (p: PaymentProvider, body: unknown, query = "") => p.parseWebhook(JSON.stringify(body), new Headers(), new URL(`https://lastro.test/api/payments/webhook/disrupty${query}`));
const access = (db: Db, u: string) => getAccess(db, u, new Date(), HOLDINGS);

/* ------------------------------------- config ------------------------------------- */

test("disrupty: only configured with both keys and both offer ids — otherwise payments stay unavailable", () => {
  const c = disruptyConfig(env());
  assert.deepEqual([c?.apiUrl, c?.offerId], ["https://api.disruptybr.app", { mensal: 101, vitalicio: 202 }]);
  assert.equal(disruptyConfig(env({ DISRUPTY_PRIVATE_KEY: "" })), null);
  assert.equal(disruptyConfig(env({ DISRUPTY_OFFER_ID_MENSAL: "abc" })), null);
  assert.equal(disruptyConfig(env({ DISRUPTY_API_URL: "http://api.disruptybr.app" })), null);
  assert.equal(disruptyConfig(env({ DISRUPTY_WEBHOOK_TOKEN: "short" }))?.webhookToken, null);
  assert.equal(getPaymentProvider("disrupty", { DISRUPTY_PUBLIC_KEY: "x" } as unknown as NodeJS.ProcessEnv), null);
  const p = getPaymentProvider("disrupty", env({ NODE_ENV: "production", DATABASE_URL: "postgres://x" }));
  assert.deepEqual([p?.id, p?.methods, p?.hostedCheckout, p?.supportsSubscriptions], ["disrupty", ["pix"], undefined, false]);
});

test("disrupty: amounts in reais become exact centavos; webhook sale ids are found and sanitized", () => {
  assert.equal(toMinor(87.93), 8793);
  assert.equal(toMinor("99.90"), 9990);
  assert.equal(toMinor("19,9"), 1990);
  assert.equal(toMinor("abc"), undefined);
  assert.equal(webhookSaleId({ event: "transaction.paid", data: { id: "sale_9" } }), "sale_9");
  assert.equal(webhookSaleId({ saleId: 42 }), "42");
  assert.equal(webhookSaleId({ id: "../../admin" }), undefined);
});

/* ------------------------------------ checkout ------------------------------------ */

test("disrupty: checkout creates a Pix sale on Lastro's own page — keys only in headers, QR drawn locally", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, saleId, result } = await checkout(db, c, p, u, "vitalicio");
  const call = api.calls[0];
  assert.deepEqual([call.method, call.path], ["POST", "/api/sales"]);
  assert.equal(call.headers.get("x-api-public-key"), ENV.DISRUPTY_PUBLIC_KEY);
  assert.equal(call.headers.get("idempotency-key"), orderId);
  assert.deepEqual(call.body, { offerId: 202, amount: 99.9, paymentMethod: "PIX", customer: { name: "Maria Souza", email: "maria@exemplo.com" } });
  assert.ok(!JSON.stringify(call.body).includes("dsrp_priv"));
  assert.equal(result.instructions.kind, "pix");
  const pix = result.instructions as { copyPaste: string; qrCodeImage: string };
  assert.equal(pix.copyPaste, PIX);
  assert.ok(pix.qrCodeImage.startsWith("data:image/svg+xml;base64,"));
  const [row] = await db.query<{ provider_payment_id: string; payment_method: string }>(`select provider_payment_id, payment_method from lastro.orders where id = $1`, [orderId]);
  assert.deepEqual([row.provider_payment_id, row.payment_method], [saleId, "pix"]);

  await checkout(db, c, p, await newUser(db, c), "mensal");
  assert.deepEqual([api.calls[1].body as Record<string, unknown>].map((b) => [b.offerId, b.amount]), [[101, 19.9]]);
  await assert.rejects(p.createCheckout({ orderId, plan: { id: "vitalicio", name: "", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: "card", customer: null, returnUrl: "" }));
});

test("disrupty: a failed sale creation (401, no Pix code) is an error, never a fake charge", async () => {
  const bad = createDisruptyProvider({ ...(disruptyConfig(env()) as DisruptyConfig), privateKey: "wrong" }, fakeApi().impl);
  await assert.rejects(bad.createCheckout({ orderId: randomUUID(), plan: { id: "vitalicio", name: "", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: "pix", customer: null, returnUrl: "" }), /401/);
  const noPix = createDisruptyProvider(disruptyConfig(env()) as DisruptyConfig, (async () => new Response(JSON.stringify({ id: "s1", status: "PENDENTE" }), { status: 201 })) as typeof fetch);
  await assert.rejects(noPix.createCheckout({ orderId: randomUUID(), plan: { id: "vitalicio", name: "", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: "pix", customer: null, returnUrl: "" }), /Pix code/);
});

/* ------------------------------------- webhook ------------------------------------- */

test("disrupty: a paid webhook is confirmed with Disrupty's API before access is released, exactly once", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, saleId } = await checkout(db, c, p, u);

  // The webhook says "paid" but Disrupty still says PENDENTE: nothing is released.
  const early = await hook(p, { event: "transaction.paid", data: { id: saleId, status: "PAGO", amount: 99.9 } });
  assert.equal(early?.[0].type, "payment.pending");
  assert.equal(await handlePaymentEvent(db, c, "disrupty", early![0]), "ignored");
  assert.equal((await access(db, u)).state, "none");

  api.set(saleId, { status: "PAGO", paidAt: new Date().toISOString() });
  const events = await hook(p, { event: "transaction.paid", data: { id: saleId } });
  assert.equal(api.calls.at(-1)?.path, `/api/sales/${saleId}`);
  assert.equal(await handlePaymentEvent(db, c, "disrupty", events![0]), "applied");
  assert.equal((await access(db, u)).state, "lifetime");
  const [o] = await db.query<{ status: string }>(`select status from lastro.orders where id = $1`, [orderId]);
  assert.equal(o.status, "approved");

  // Retries and the page's own status check never count twice.
  assert.equal(await handlePaymentEvent(db, c, "disrupty", (await hook(p, { event: "transaction.paid", data: { id: saleId } }))![0]), "duplicate");
  await orderStatus(db, c, u, orderId, p);
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from lastro.charges where gateway_transaction_id = $1`, [saleId]);
  assert.equal(n, 1);
  assert.equal((await outbox(db, "purchase")).length, 1);
});

test("disrupty: a forged webhook can't invent a payment — unknown sale, wrong id in the answer, wrong token", async () => {
  const { api, p } = setup({ DISRUPTY_WEBHOOK_TOKEN: "tok_0123456789abcdef" });
  assert.equal(await hook(p, { event: "transaction.paid", data: { id: "sale_999", status: "PAGO", amount: 99.9 } }, "?token=tok_0123456789abcdef"), null);
  assert.equal(await hook(p, { event: "transaction.paid" }, "?token=tok_0123456789abcdef"), null);
  assert.equal(await hook(p, "not json", "?token=tok_0123456789abcdef"), null);
  const before = api.calls.length;
  assert.equal(await hook(p, { data: { id: "sale_1" } }), null); // no token: turned away before any call
  assert.equal(await hook(p, { data: { id: "sale_1" } }, "?token=nope"), null);
  assert.equal(api.calls.length, before);

  const liar = createDisruptyProvider(disruptyConfig(env()) as DisruptyConfig, (async () => new Response(JSON.stringify({ id: "other", status: "PAGO", amount: 99.9 }), { status: 200 })) as typeof fetch);
  assert.equal(await hook(liar, { data: { id: "sale_1" } }), null);
});

test("disrupty: a paid amount different from the plan's goes to a person, no access", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { saleId } = await checkout(db, c, p, u);
  api.set(saleId, { status: "PAGO", amount: 1.0 });
  assert.equal(await handlePaymentEvent(db, c, "disrupty", (await hook(p, { data: { id: saleId } }))![0]), "review");
  assert.equal((await access(db, u)).state, "none");
  const [r] = await db.query<{ kind: string }>(`select kind from lastro.payment_reviews where gateway_transaction_id = $1`, [saleId]);
  assert.equal(r.kind, "amount_mismatch");
});

test("disrupty: failed and expired Pix close the order; unknown statuses go to a person", async () => {
  const db = await freshDb();
  const c = testConfig();
  const { api, p } = setup();
  const u1 = await newUser(db, c);
  const a = await checkout(db, c, p, u1);
  api.set(a.saleId, { status: "RECUSADO" });
  assert.equal(await handlePaymentEvent(db, c, "disrupty", (await hook(p, { data: { id: a.saleId } }))![0]), "applied");
  const u2 = await newUser(db, c);
  const b = await checkout(db, c, p, u2);
  api.set(b.saleId, { status: "EXPIRADO" });
  assert.equal(await handlePaymentEvent(db, c, "disrupty", (await hook(p, { data: { id: b.saleId } }))![0]), "applied");
  const rows = await db.query<{ id: string; status: string }>(`select id, status from lastro.orders where id in ($1, $2) order by status`, [a.orderId, b.orderId]);
  assert.deepEqual(rows.map((r) => r.status), ["expired", "failed"]);

  const u3 = await newUser(db, c);
  const d = await checkout(db, c, p, u3);
  api.set(d.saleId, { status: "EM_DISPUTA" });
  assert.equal(await handlePaymentEvent(db, c, "disrupty", (await hook(p, { data: { id: d.saleId } }))![0]), "review");
  assert.equal((await access(db, u3)).state, "none");
});

test("disrupty: the page's status check confirms with Disrupty too (no webhook needed)", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { orderId, saleId } = await checkout(db, c, p, u, "mensal");
  assert.equal((await orderStatus(db, c, u, orderId, p))?.status, "pending");
  api.set(saleId, { status: "PAGO" });
  assert.equal((await orderStatus(db, c, u, orderId, p))?.status, "approved");
  assert.equal((await access(db, u)).state, "monthly");
});

test("disrupty: a refund or chargeback re-read from the API takes the access back", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const { api, p } = setup();
  const { saleId } = await checkout(db, c, p, u);
  api.set(saleId, { status: "PAGO" });
  await handlePaymentEvent(db, c, "disrupty", (await hook(p, { data: { id: saleId } }))![0]);
  assert.equal((await access(db, u)).state, "lifetime");
  api.set(saleId, { status: "CHARGEBACK" });
  const [ev] = (await hook(p, { data: { id: saleId } }))!;
  assert.deepEqual([ev.type, ev.refundReason], ["payment.refunded", "chargeback"]);
  assert.equal(await handlePaymentEvent(db, c, "disrupty", ev), "applied");
  assert.equal((await access(db, u)).state, "none");
});
