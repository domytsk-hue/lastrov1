import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { browser, freshDb, landWithRef, newUser, openOrder, outbox, promote, testConfig } from "../test-helpers.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { handlePaymentEvent } from "../payments/orders.ts";
import { purchaseAttribution } from "./attribution.ts";
import { parseRefCookie } from "./ref-cookie.ts";
import { toCentralisV1 } from "../centralis/v1.ts";
import type { Envelope } from "../centralis/outbox.ts";

const DAY = 86_400_000;

async function setup() {
  const db = await freshDb();
  const config = testConfig();
  const joao = await newUser(db, config, "João Silva");
  await promote(db, config, joao, "JOAO");
  return { db, config };
}

/** Pays an order like a gateway confirmation would. */
async function pay(db: Db, config: CentralisConfig, orderId: string, amount: number, at = new Date()) {
  return handlePaymentEvent(db, config, "sandbox", { providerEventId: `evt_${randomUUID()}`, type: "payment.approved", orderId, transactionId: `tx_${randomUUID()}`, amountMinor: amount, currency: "BRL", occurredAt: at });
}
const chargeCode = async (db: Db, orderId: string) => (await db.query<{ affiliate_code: string | null }>(`select affiliate_code from lastro.charges where order_id = $1`, [orderId]))[0]?.affiliate_code ?? null;

test("attribution: the click is the first source (last click within the window)", async () => {
  const { db, config } = await setup();
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const maria = await newUser(db, config, "Maria", "maria@exemplo.com", b.visitorId);
  const { orderId, plan } = await openOrder(db, config, maria, "vitalicio", { visitorId: b.visitorId });
  await pay(db, config, orderId, plan.amount_minor);
  assert.equal(await chargeCode(db, orderId), "JOAO");
});

test("attribution: click lost after checkout opened → the order's own record still credits the affiliate", async () => {
  const { db, config } = await setup();
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const maria = await newUser(db, config, "Maria", "maria@exemplo.com", b.visitorId);
  const { orderId, plan } = await openOrder(db, config, maria, "vitalicio", { visitorId: b.visitorId });
  await db.query(`delete from lastro.attributions`); // e.g. the window ran out between checkout and payment
  await pay(db, config, orderId, plan.amount_minor);
  assert.equal(await chargeCode(db, orderId), "JOAO");
});

test("attribution: no click on record → the affiliate the account signed up through (within the window)", async () => {
  const { db, config } = await setup();
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const maria = await newUser(db, config, "Maria", "maria@exemplo.com", b.visitorId);
  await db.query(`delete from lastro.attributions`);
  const { orderId, plan } = await openOrder(db, config, maria, "mensal", { visitorId: null });
  await pay(db, config, orderId, plan.amount_minor);
  assert.equal(await chargeCode(db, orderId), "JOAO");
  // Reported to Centralis with the code and the buyer's profile.
  const [purchase] = (await outbox(db, "purchase")).map((e) => toCentralisV1(e.payload as unknown as Envelope));
  assert.equal(purchase.data?.affiliate_code, "JOAO");
  assert.equal(purchase.user?.email, "maria@exemplo.com");
  assert.equal(purchase.user?.name, "Maria");
});

test("attribution: sign-up referral outside the window, or a suspended affiliate, credits no one", async () => {
  const { db, config } = await setup();
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  const maria = await newUser(db, config, "Maria", "maria@exemplo.com", b.visitorId);
  await db.query(`delete from lastro.attributions`);
  const at = new Date(Date.now() + 31 * DAY);
  assert.equal(await purchaseAttribution(db, { userId: maria, visitorId: null, orderAffiliateId: null }, at), null);
  assert.ok(await purchaseAttribution(db, { userId: maria, visitorId: null, orderAffiliateId: null }));
  await db.query(`update lastro.affiliates set status = 'suspended'`);
  assert.equal(await purchaseAttribution(db, { userId: maria, visitorId: null, orderAffiliateId: null }), null);
});

test("attribution: a direct purchase stays without affiliate", async () => {
  const { db, config } = await setup();
  const ana = await newUser(db, config, "Ana", "ana@exemplo.com");
  const { orderId, plan } = await openOrder(db, config, ana, "vitalicio");
  await pay(db, config, orderId, plan.amount_minor);
  assert.equal(await chargeCode(db, orderId), null);
});

test("ref cookie: only well-formed codes and real (not future) times", () => {
  const now = Date.now();
  assert.deepEqual(parseRefCookie(`JOAO.${now - 1000}`, now), { code: "JOAO", at: new Date(now - 1000) });
  assert.equal(parseRefCookie(`JOAO.${now + 3_600_000}`, now), null);
  assert.equal(parseRefCookie("joao.123", now), null);
  assert.equal(parseRefCookie("<script>.1712345678901", now), null);
  assert.equal(parseRefCookie(null, now), null);
});
