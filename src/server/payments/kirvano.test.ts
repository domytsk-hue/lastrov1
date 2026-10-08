import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browser, freshDb, landWithRef, newUser, outbox, promote, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { getAccess, HOLDINGS } from "../access/entitlements.ts";
import { attachCheckout, billingFieldsOf, createOrder, validateBilling } from "./checkout.ts";
import { handlePaymentEvent } from "./orders.ts";
import { createKirvanoProvider, kirvanoConfig, kirvanoEvent, orderRef, parseBrlToMinor, parseKirvanoDate, type KirvanoConfig } from "./kirvano.ts";
import { getPaymentProvider } from "./registry.ts";
import { toCentralisV1 } from "../centralis/v1.ts";
import type { Envelope } from "../centralis/outbox.ts";

const TOKEN = "kv_test_token_0123456789abcdef";
const OFFER_MENSAL = "11111111-1111-4111-8111-111111111111";
const OFFER_VITALICIO = "22222222-2222-4222-8222-222222222222";
const ENV = {
  KIRVANO_WEBHOOK_TOKEN: TOKEN,
  KIRVANO_CHECKOUT_URL_MENSAL: "https://pay.kirvano.com/mensal-offer",
  KIRVANO_CHECKOUT_URL_VITALICIO: "https://pay.kirvano.com/vitalicio-offer",
  KIRVANO_OFFER_ID_MENSAL: OFFER_MENSAL,
  KIRVANO_OFFER_ID_VITALICIO: OFFER_VITALICIO,
};
const config = (over: Record<string, string> = {}) => kirvanoConfig({ ...ENV, ...over } as unknown as NodeJS.ProcessEnv) as KirvanoConfig;
const provider = (over: Record<string, string> = {}) => createKirvanoProvider(config(over));

/** "YYYY-MM-DD HH:mm:ss" in Brasília time, as Kirvano writes it (default: a minute ago). */
const brt = (d = new Date(Date.now() - 60_000)) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

/** Kirvano's published "Compra aprovada" example, reduced to one product of ours. */
function sale(over: Record<string, unknown> = {}, opts: { orderId?: string; offer?: string; price?: string; email?: string } = {}) {
  return {
    event: "SALE_APPROVED",
    event_description: "Compra aprovada",
    checkout_id: "Q8J1N6K3",
    sale_id: `S${randomUUID().slice(0, 7).toUpperCase()}`,
    payment_method: "CREDIT_CARD",
    total_price: opts.price ?? "R$ 99,90",
    type: "ONE_TIME",
    status: "APPROVED",
    created_at: brt(),
    customer: { name: "Maria Souza", document: "23875090127", email: opts.email ?? "maria@exemplo.com", phone_number: "5511987654321" },
    payment: { method: "CREDIT_CARD", brand: "visa", installments: 1, finished_at: brt() },
    products: [{ id: randomUUID(), name: "Lastro", offer_id: opts.offer ?? OFFER_VITALICIO, offer_name: "Lastro", price: opts.price ?? "R$ 99,90", is_order_bump: false }],
    utm: { src: opts.orderId ? orderRef(opts.orderId) : null, utm_source: "instagram" },
    ...over,
  };
}

async function deliver(db: Db, c: CentralisConfig, body: unknown, p = provider()) {
  const events = await p.parseWebhook(JSON.stringify(body), new Headers({ "x-kirvano-token": TOKEN }), new URL("https://lastro.test/api/payments/webhook/kirvano"));
  assert.ok(events, "authentic webhook must parse");
  return handlePaymentEvent(db, c, "kirvano", events[0]);
}

async function kirvanoOrder(db: Db, c: CentralisConfig, userId: string, plan: string) {
  const r = await createOrder(db, c, { userId, planId: plan, method: "", idempotencyKey: `k_${randomUUID()}`, visitorId: null, provider: provider() });
  if (!r.ok) throw new Error(r.error);
  return r.order;
}

const access = (db: Db, u: string, at = new Date()) => getAccess(db, u, at, HOLDINGS);

/* ------------------------------------- config ------------------------------------- */

test("kirvano: only fully configured (token ≥ 16 chars, both offer pages over https) — otherwise payments stay unavailable", () => {
  assert.ok(kirvanoConfig(ENV as unknown as NodeJS.ProcessEnv));
  assert.equal(kirvanoConfig({ ...ENV, KIRVANO_WEBHOOK_TOKEN: "short" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(kirvanoConfig({ ...ENV, KIRVANO_CHECKOUT_URL_MENSAL: "http://pay.kirvano.com/x" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(kirvanoConfig({ ...ENV, KIRVANO_CHECKOUT_URL_VITALICIO: "" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(getPaymentProvider("kirvano", { KIRVANO_WEBHOOK_TOKEN: TOKEN } as unknown as NodeJS.ProcessEnv), null);
  const p = getPaymentProvider("kirvano", { ...ENV, NODE_ENV: "production", DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual([p?.id, p?.hostedCheckout, p?.supportsSubscriptions, p?.autoRenews], ["kirvano", true, false, false]);
  assert.equal(getPaymentProvider("kirvano", { ...ENV, KIRVANO_MENSAL_RECORRENTE: "true" } as unknown as NodeJS.ProcessEnv)?.autoRenews, true);
});

test("kirvano: money and dates as Kirvano writes them", () => {
  assert.equal(parseBrlToMinor("R$ 99,90"), 9990);
  assert.equal(parseBrlToMinor("R$ 19,90"), 1990);
  assert.equal(parseBrlToMinor("R$ 1.234,56"), 123456);
  assert.equal(parseBrlToMinor("R$ 169,8"), 16980);
  assert.equal(parseBrlToMinor(99.9), 9990);
  assert.equal(parseBrlToMinor("noventa"), undefined);
  assert.equal(parseBrlToMinor(null), undefined);
  assert.equal(parseKirvanoDate("2026-10-08 10:40:21")?.toISOString(), "2026-10-08T13:40:21.000Z");
  assert.equal(parseKirvanoDate("08/10/2026"), undefined);
});

/* ------------------------------------ checkout ------------------------------------ */

test("kirvano: checkout sends the buyer to the plan's offer page with only our order reference", async () => {
  const p = provider();
  const r = await p.createCheckout({ orderId: "0f0f0f0f-0000-4000-8000-000000000001", plan: { id: "vitalicio", name: "Vitalício", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: null, customer: null, returnUrl: "https://x/checkout" });
  assert.equal(r.instructions.kind, "redirect");
  const url = new URL((r.instructions as { url: string }).url);
  assert.equal(url.origin + url.pathname, "https://pay.kirvano.com/vitalicio-offer");
  assert.deepEqual([...url.searchParams.keys()], ["src"]);
  assert.equal(url.searchParams.get("src"), "lastro-0f0f0f0f-0000-4000-8000-000000000001");
  const m = await p.createCheckout({ orderId: "0f0f0f0f-0000-4000-8000-000000000002", plan: { id: "mensal", name: "Mensal", amountMinor: 1990, currency: "BRL", billing: "monthly" }, method: null, customer: null, returnUrl: "" });
  assert.ok((m.instructions as { url: string }).url.startsWith("https://pay.kirvano.com/mensal-offer?src=lastro-"));
});

test("kirvano: hosted checkout needs no method or billing data; the order is created without them", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const o = await kirvanoOrder(db, c, u, "vitalicio");
  assert.deepEqual([o.plan_id, o.amount_minor, o.payment_method, o.status], ["vitalicio", 9990, null, "pending"]);
});

/* ---------------------------------- authenticity ---------------------------------- */

test("kirvano: a webhook without the right token is not a payment (header or ?token=)", async () => {
  const p = provider();
  const body = JSON.stringify(sale());
  const url = new URL("https://lastro.test/api/payments/webhook/kirvano");
  assert.equal(await p.parseWebhook(body, new Headers(), url), null);
  assert.equal(await p.parseWebhook(body, new Headers({ "x-kirvano-token": "wrong-token-wrong-token" }), url), null);
  assert.equal(await p.parseWebhook(body, new Headers(), new URL(`${url}?token=nope`)), null);
  assert.equal((await p.parseWebhook(body, new Headers({ "x-kirvano-token": TOKEN }), url))?.[0].type, "payment.approved");
  assert.equal((await p.parseWebhook(body, new Headers(), new URL(`${url}?token=${TOKEN}`)))?.[0].type, "payment.approved");
  assert.equal(await p.parseWebhook("not json", new Headers({ "x-kirvano-token": TOKEN }), url), null);
});

test("kirvano: events map by name AND status; unknown ones are kept for review, never guessed", () => {
  const c = config();
  const ev = (o: Record<string, unknown>) => kirvanoEvent(c, sale(o));
  const ok = ev({});
  assert.deepEqual([ok?.type, ok?.amountMinor, ok?.currency, ok?.planId, ok?.method], ["payment.approved", 9990, "BRL", "vitalicio", "card"]);
  assert.equal(ok?.providerEventId, `SALE_APPROVED:${ok?.transactionId}`);
  assert.equal(ev({ status: "PENDING" })?.type, "unhandled"); // "approved" event that isn't approved
  assert.equal(ev({ event: "PIX_GENERATED", status: "PENDING", payment_method: "PIX" })?.type, "payment.pending");
  assert.equal(ev({ event: "PIX_EXPIRED", status: "CANCELED" })?.type, "payment.expired");
  assert.equal(ev({ event: "ABANDONED_CART", status: "ABANDONED_CART" })?.type, "payment.pending");
  assert.equal(ev({ event: "SALE_REFUSED", status: "REFUSED" })?.type, "payment.failed");
  const refund = ev({ event: "SALE_REFUNDED", status: "REFUNDED" });
  assert.deepEqual([refund?.type, refund?.refundReason], ["payment.refunded", "refund"]);
  assert.deepEqual([ev({ event: "SALE_CHARGEBACK", status: "CHARGEBACK" })?.refundReason], ["chargeback"]);
  assert.equal(ev({ event: "SOMETHING_NEW_REFUND", status: "REFUNDED" })?.type, "payment.refunded"); // renamed event, status still says it
  const unknown = ev({ event: "BRAND_NEW_EVENT", status: "WHATEVER" });
  assert.deepEqual([unknown?.type, unknown?.gatewayEventName], ["unhandled", "BRAND_NEW_EVENT"]);
  assert.equal(ev({ products: [{ offer_id: "someone-elses-offer" }] })?.planId, "unknown");
});

/* ------------------------------------- flows ------------------------------------- */

test("kirvano: approved sale with our reference → lifetime access; Centralis gets R$ 99,90 with the affiliate; replay is a duplicate", async () => {
  const db = await freshDb();
  const c = testConfig();
  const joao = await newUser(db, c, "João");
  await promote(db, c, joao, "JOAO");
  const b = await browser(db, c);
  await landWithRef(db, c, b, "JOAO", new Date(Date.now() - 3_600_000)); // clicked an hour before paying
  const u = await newUser(db, c, "Maria", "maria@exemplo.com", b.visitorId);
  const o = await kirvanoOrder(db, c, u, "vitalicio");
  const body = sale({}, { orderId: o.id });
  assert.equal(await deliver(db, c, body), "applied");
  assert.equal(await deliver(db, c, body), "duplicate");
  const a = await access(db, u);
  assert.deepEqual([a.active, a.state], [true, "lifetime"]);
  const [order] = await db.query<{ status: string; payment_method: string }>(`select status, payment_method from lastro.orders where id = $1`, [o.id]);
  assert.deepEqual(order, { status: "approved", payment_method: "card" });
  const purchases = await outbox(db, "purchase");
  assert.equal(purchases.length, 1);
  const v1 = toCentralisV1(purchases[0].payload as unknown as Envelope);
  assert.deepEqual([v1.data?.amount, v1.data?.currency, v1.data?.affiliate_code, v1.data?.payment_method], [99.9, "BRL", "JOAO", "kirvano"]);
});

test("kirvano: the buyer's CPF and phone from the webhook are never stored or sent", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c, "Maria", "maria@exemplo.com");
  const o = await kirvanoOrder(db, c, u, "vitalicio");
  await deliver(db, c, sale({}, { orderId: o.id }));
  await deliver(db, c, sale({ event: "SOMETHING_UNKNOWN" }, { orderId: o.id }));
  const dump = JSON.stringify(await Promise.all(["centralis_outbox", "orders", "charges", "payment_reviews", "processed_webhooks", "access_entitlements"].map((t) => db.query(`select * from lastro.${t}`))));
  for (const s of ["23875090127", "5511987654321", "visa"]) assert.equal(dump.includes(s), false, s);
});

test("kirvano: reference lost → the account's open order is found by its e-mail; another e-mail is not anyone's purchase", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c, "Maria", "maria@exemplo.com");
  await kirvanoOrder(db, c, u, "vitalicio");
  assert.equal(await deliver(db, c, sale({}, { email: "Outra@Pessoa.com" })), "review");
  assert.equal((await access(db, u)).active, false);
  assert.equal(await deliver(db, c, sale({}, { email: "MARIA@exemplo.com" })), "applied");
  assert.equal((await access(db, u)).state, "lifetime");
  const [r] = await db.query<{ kind: string; detail: { order_id: string | null } }>(`select kind, detail from lastro.payment_reviews`);
  assert.equal(r.kind, "unknown_order");
});

test("kirvano: another offer, an order bump or a different total don't release access — they go to review", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const o = await kirvanoOrder(db, c, u, "vitalicio");
  assert.equal(await deliver(db, c, sale({}, { orderId: o.id, offer: OFFER_MENSAL, price: "R$ 19,90" })), "review");
  assert.equal(await deliver(db, c, sale({}, { orderId: o.id, offer: "another-product-offer" })), "review");
  assert.equal(await deliver(db, c, sale({ total_price: "R$ 169,80" }, { orderId: o.id })), "review");
  assert.equal((await access(db, u)).active, false);
  assert.equal((await outbox(db, "purchase")).length, 0);
  assert.equal((await db.query(`select id from lastro.payment_reviews where kind = 'amount_mismatch'`)).length, 3);
});

test("kirvano: Pix generated is not a purchase; expired Pix closes the order; a refused card fails it", async () => {
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  let o = await kirvanoOrder(db, c, u, "vitalicio");
  assert.equal(await deliver(db, c, sale({ event: "PIX_GENERATED", status: "PENDING", payment_method: "PIX" }, { orderId: o.id })), "ignored");
  assert.equal(await deliver(db, c, sale({ event: "PIX_EXPIRED", status: "CANCELED" }, { orderId: o.id })), "applied");
  o = await kirvanoOrder(db, c, u, "vitalicio");
  assert.equal(await deliver(db, c, sale({ event: "SALE_REFUSED", status: "REFUSED" }, { orderId: o.id })), "applied");
  const rows = await db.query<{ status: string }>(`select status from lastro.orders order by created_at`);
  assert.deepEqual(rows.map((r) => r.status), ["expired", "failed"]);
  assert.equal((await access(db, u)).active, false);
});

test("kirvano: monthly subscription — each paid month (new sale on the same reference) extends access; refund revokes only that month", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider({ KIRVANO_MENSAL_RECORRENTE: "true" });
  const u = await newUser(db, c, "Bruno", "bruno@exemplo.com");
  const o = await kirvanoOrder(db, c, u, "mensal");
  const first = sale({ created_at: "2026-10-08 10:00:00", payment: { method: "PIX", finished_at: "2026-10-08 10:00:00" }, payment_method: "PIX" }, { orderId: o.id, offer: OFFER_MENSAL, price: "R$ 19,90" });
  assert.equal(await deliver(db, c, first, p), "applied");
  assert.equal((await access(db, u, new Date("2026-10-09T00:00:00-03:00"))).validUntil, new Date("2026-11-08T10:00:00-03:00").toISOString());
  // Kirvano charges month two: a new sale, same reference (or found by e-mail).
  const second = sale({ created_at: "2026-11-08 10:00:00", payment: { method: "CREDIT_CARD", finished_at: "2026-11-08 10:00:00" } }, { offer: OFFER_MENSAL, price: "R$ 19,90", email: "bruno@exemplo.com" });
  assert.equal(await deliver(db, c, second, p), "applied");
  assert.equal((await access(db, u, new Date("2026-11-09T00:00:00-03:00"))).validUntil, new Date("2026-12-08T10:00:00-03:00").toISOString());
  const kinds = (await outbox(db, "purchase")).map((e) => (e.payload as { order: { kind: string; amount_minor: number } }).order);
  assert.deepEqual(kinds.map((k) => [k.kind, k.amount_minor]), [["initial", 1990], ["renewal", 1990]]);
  // Refund of month two: back to the end of month one, nothing else touched.
  assert.equal(await deliver(db, c, { ...second, event: "SALE_REFUNDED", status: "REFUNDED" }, p), "applied");
  assert.equal((await access(db, u, new Date("2026-11-01T00:00:00-03:00"))).validUntil, new Date("2026-11-08T10:00:00-03:00").toISOString());
});

test("kirvano: upgrade while Kirvano renews the monthly — lifetime granted, the Kirvano subscription is flagged for cancellation, a late month never removes the lifetime", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider({ KIRVANO_MENSAL_RECORRENTE: "true" });
  const u = await newUser(db, c, "Caio", "caio@exemplo.com");
  const m = await kirvanoOrder(db, c, u, "mensal");
  await deliver(db, c, sale({}, { orderId: m.id, offer: OFFER_MENSAL, price: "R$ 19,90" }), p);
  const up = await kirvanoOrder(db, c, u, "vitalicio");
  assert.equal(up.purpose, "upgrade");
  assert.equal(await deliver(db, c, sale({}, { orderId: up.id }), p), "applied");
  let a = await access(db, u);
  assert.deepEqual([a.state, a.renewalCancellationPending], ["lifetime", true]);
  const [task] = await db.query<{ order_id: string; next_attempt_at: Date | null; detail: { manual: boolean } }>(`select order_id, next_attempt_at, detail from lastro.payment_reviews where kind = 'cancel_renewal'`);
  assert.deepEqual([task.order_id, task.next_attempt_at, task.detail.manual], [m.id, null, true]);

  // Kirvano still charged another month before it was cancelled: recorded, flagged, lifetime kept.
  assert.equal(await deliver(db, c, sale({}, { orderId: m.id, offer: OFFER_MENSAL, price: "R$ 19,90" }), p), "applied");
  a = await access(db, u);
  assert.deepEqual([a.state, a.planId], ["lifetime", "vitalicio"]);
  assert.equal((await db.query(`select id from lastro.payment_reviews where kind = 'duplicate_purchase'`)).length, 1);
});

test("kirvano: an authentic event Lastro doesn't know becomes a review with its name only", async () => {
  const db = await freshDb();
  const c = testConfig();
  assert.equal(await deliver(db, c, sale({ event: "SUBSCRIPTION_PAUSED_NEW", status: "PAUSED" })), "review");
  const [r] = await db.query<{ kind: string; detail: Record<string, unknown> }>(`select kind, detail from lastro.payment_reviews`);
  assert.equal(r.kind, "unhandled_event");
  assert.equal(r.detail.event, "SUBSCRIPTION_PAUSED_NEW");
  assert.equal(JSON.stringify(r.detail).includes("maria"), false);
});

test("kirvano: subscription sale (type RECURRING) — the month runs until Kirvano's next_charge_date; a non-monthly plan is not our Mensal", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider({ KIRVANO_MENSAL_RECORRENTE: "true" });
  const u = await newUser(db, c, "Iris", "iris@exemplo.com");
  const o = await kirvanoOrder(db, c, u, "mensal");
  const paid = brt();
  const next = brt(new Date(Date.now() + 30 * 86_400_000));
  // Kirvano's published "Compra aprovada (Assinatura)" example, with our offer and price.
  const body = sale(
    { type: "RECURRING", plan: { name: "Plano Mensal", charge_frequency: "MONTHLY", next_charge_date: next }, payment: { method: "CREDIT_CARD", brand: "visa", installments: 1, finished_at: paid } },
    { orderId: o.id, offer: OFFER_MENSAL, price: "R$ 19,90" },
  );
  assert.equal(await deliver(db, c, body, p), "applied");
  assert.equal((await access(db, u)).validUntil, parseKirvanoDate(next)?.toISOString());

  const yearly = await newUser(db, c, "Yuri", "yuri@exemplo.com");
  const oy = await kirvanoOrder(db, c, yearly, "mensal");
  const annual = sale({ type: "RECURRING", plan: { name: "Plano Anual", charge_frequency: "ANNUALLY", next_charge_date: next } }, { orderId: oy.id, offer: OFFER_MENSAL, price: "R$ 19,90" });
  assert.equal(await deliver(db, c, annual, p), "review");
  assert.equal((await access(db, yearly)).active, false);
});

test("kirvano: the published refusal, chargeback and bank-slip events", () => {
  const c = config();
  const ev = (o: Record<string, unknown>) => kirvanoEvent(c, sale(o));
  assert.equal(ev({ event: "SALE_REFUSED", status: "REFUSED", payment_method: "CREDIT_CARD" })?.type, "payment.failed");
  assert.deepEqual([ev({ event: "SALE_CHARGEBACK", status: "CHARGEBACK" })?.type, ev({ event: "SALE_CHARGEBACK", status: "CHARGEBACK" })?.refundReason], ["payment.refunded", "chargeback"]);
  assert.equal(ev({ event: "BANK_SLIP_GENERATED", status: "PENDING", payment_method: "BANK_SLIP" })?.type, "payment.pending");
  assert.equal(ev({ event: "BANK_SLIP_EXPIRED", status: "CANCELED", payment_method: "BANK_SLIP" })?.type, "payment.expired");
});

test("kirvano: renewals that reuse the original sale_id still add a month each; Kirvano's retries don't; a refund hits the latest paid cycle", async () => {
  const db = await freshDb();
  const c = testConfig();
  const p = provider({ KIRVANO_MENSAL_RECORRENTE: "true" });
  const u = await newUser(db, c, "Rui", "rui@exemplo.com");
  const o = await kirvanoOrder(db, c, u, "mensal");
  const SALE = "D2RP8RQ7";
  const day = 86_400_000;
  const t0 = Date.now() - 45 * day; // "now" sits in the middle of the second paid month
  const at = (d: number) => brt(new Date(t0 + d * day));
  const cycle = (event: string, paid: number, next: number) =>
    sale(
      { event, sale_id: SALE, type: "RECURRING", plan: { name: "Plano Mensal", charge_frequency: "MONTHLY", next_charge_date: at(next) }, payment: { method: "CREDIT_CARD", brand: "visa", installments: 1, finished_at: at(paid) }, created_at: at(paid) },
      { orderId: o.id, offer: OFFER_MENSAL, price: "R$ 19,90" },
    );
  assert.equal(await deliver(db, c, cycle("SALE_APPROVED", 0, 30), p), "applied");
  // Kirvano's published "Assinatura renovada": same sale_id, a new cycle.
  assert.equal(await deliver(db, c, cycle("SUBSCRIPTION_RENEWED", 30, 60), p), "applied");
  assert.equal(await deliver(db, c, cycle("SUBSCRIPTION_RENEWED", 30, 60), p), "duplicate"); // Kirvano retrying
  assert.equal(await deliver(db, c, cycle("SUBSCRIPTION_RENEWED", 60, 90), p), "applied");
  assert.equal((await access(db, u)).validUntil, parseKirvanoDate(at(90))?.toISOString());
  assert.equal((await db.query(`select id from lastro.charges`)).length, 3);
  // "Assinatura atrasada" / "Assinatura cancelada": informational — the paid time simply runs.
  assert.equal(await deliver(db, c, { ...cycle("SUBSCRIPTION_EXPIRED", 90, 90), status: "PENDING" }, p), "ignored");
  assert.equal(await deliver(db, c, { ...cycle("SUBSCRIPTION_CANCELED", 90, 90), status: "CANCELED" }, p), "ignored");
  assert.equal((await access(db, u)).validUntil, parseKirvanoDate(at(90))?.toISOString());
  // Kirvano's published "Reembolso" (same sale_id): the latest paid cycle is refunded.
  assert.equal(await deliver(db, c, { ...cycle("SALE_REFUNDED", 60, 90), status: "REFUNDED" }, p), "applied");
  assert.equal((await access(db, u)).validUntil, parseKirvanoDate(at(60))?.toISOString());
});

test("kirvano: Lastro's form pre-fills Kirvano's page (name, e-mail, phone); the CPF only with KIRVANO_PREFILL_CPF; nothing personal is saved", async () => {
  const req = (p: ReturnType<typeof provider>) =>
    p.createCheckout({
      orderId: "0f0f0f0f-0000-4000-8000-000000000003",
      plan: { id: "vitalicio", name: "Vitalício", amountMinor: 9990, currency: "BRL", billing: "one_time" },
      method: null,
      customer: { userId: "u_1", name: "Maria Souza", email: "maria@exemplo.com", phone: "+5511987654321", document: "52998224725" },
      returnUrl: "",
    });
  const p = provider();
  assert.deepEqual(p.billingFields, ["name", "email", "phone"]);
  const r = await req(p);
  const raw = (r.instructions as { url: string }).url;
  assert.ok(raw.includes("customer.name=Maria%20Souza"), raw); // spaces as %20, as Kirvano documents
  const url = new URL(raw);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    src: "lastro-0f0f0f0f-0000-4000-8000-000000000003",
    "customer.name": "Maria Souza",
    "customer.email": "maria@exemplo.com",
    "customer.phone": "5511987654321",
  });
  assert.equal((r.storable as { url: string }).url, "https://pay.kirvano.com/vitalicio-offer?src=lastro-0f0f0f0f-0000-4000-8000-000000000003");

  const withCpf = provider({ KIRVANO_PREFILL_CPF: "true" });
  assert.deepEqual(withCpf.billingFields, ["name", "email", "phone", "cpf"]);
  assert.equal(new URL(((await req(withCpf)).instructions as { url: string }).url).searchParams.get("customer.document"), "52998224725");

  // The order keeps only the link without personal data.
  const db = await freshDb();
  const c = testConfig();
  const u = await newUser(db, c);
  const o = await kirvanoOrder(db, c, u, "vitalicio");
  await attachCheckout(db, o.id, await p.createCheckout({ orderId: o.id, plan: { id: "vitalicio", name: "Vitalício", amountMinor: 9990, currency: "BRL", billing: "one_time" }, method: null, customer: { userId: u, name: "Maria Souza", email: "maria@exemplo.com", phone: "+5511987654321", document: null }, returnUrl: "" }));
  const [row] = await db.query<{ payment_instructions: { url: string } }>(`select payment_instructions from lastro.orders where id = $1`, [o.id]);
  assert.equal(row.payment_instructions.url.includes("customer."), false);
});

test("billing validation follows the gateway's fields: Kirvano asks name, e-mail and phone — not the CPF", () => {
  const p = provider();
  const ok = validateBilling({ name: "Maria Souza", phone: "(11) 98765-4321", cpf: "", email: "" }, "conta@lastro.com", billingFieldsOf(p));
  assert.ok(ok.ok);
  assert.deepEqual(ok.value, { name: "Maria Souza", document: null, phone: "+5511987654321", email: "conta@lastro.com" });
  const bad = validateBilling({ name: "Maria", phone: "", cpf: "", email: "" }, null, billingFieldsOf(p));
  assert.deepEqual(Object.keys((bad as { errors: object }).errors).sort(), ["email", "name", "phone"]);
});
