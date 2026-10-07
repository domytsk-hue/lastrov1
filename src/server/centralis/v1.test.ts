import { test } from "node:test";
import assert from "node:assert/strict";
import { action, browser, buy, freshDb, landWithRef, newUser, outbox, promote, testConfig } from "../test-helpers.ts";
import { handleCentralisAction } from "./actions.ts";
import { handlePaymentEvent } from "../payments/orders.ts";
import { enqueue, type Envelope } from "./outbox.ts";
import { toCentralisV1, toMajor, type CentralisV1Event } from "./v1.ts";

/** The rules Centralis Hub's /api/v1/events validator applies (src/schemas/events.ts there). */
const KNOWN = ["page_view", "session_start", "affiliate_click", "signup", "login", "user_updated", "checkout_start", "purchase", "refund", "subscription_started", "subscription_renewed", "subscription_updated", "subscription_cancelled"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertCentralisValid(e: CentralisV1Event) {
  const where = `${e.type} ${e.event_id}`;
  assert.match(e.event_id, UUID, where);
  assert.match(e.type, /^[a-z][a-z0-9_.]{1,63}$/, where);
  assert.ok(!Number.isNaN(Date.parse(e.occurred_at)) && e.occurred_at.endsWith("Z"), where);
  if (e.visitor_id) assert.match(e.visitor_id, UUID, where);
  if (e.session_id) assert.match(e.session_id, UUID, where);
  if (e.user) {
    assert.ok(e.user.id && e.user.id.length <= 128, where);
    if (e.user.status) assert.ok(["active", "inactive", "blocked"].includes(e.user.status), where);
  }
  const d = (e.data ?? {}) as Record<string, unknown>;
  const money = (v: unknown) => typeof v === "number" && v >= 0;
  switch (e.type) {
    case "page_view": assert.ok(e.page?.path, where); break;
    case "affiliate_click": assert.ok(e.visitor_id && typeof d.code === "string", where); break;
    case "signup": case "login": case "user_updated": assert.ok(e.user?.id, where); break;
    case "purchase": assert.ok(typeof d.order_id === "string" && money(d.amount) && d.status === "paid", where); break;
    case "refund": assert.ok(typeof d.order_id === "string", where); break;
    case "subscription_started": assert.ok(typeof d.subscription_id === "string" && typeof d.plan === "string" && money(d.amount), where); break;
    case "subscription_renewed": case "subscription_updated": case "subscription_cancelled": assert.ok(typeof d.subscription_id === "string", where); break;
  }
  if (!KNOWN.includes(e.type)) {
    // Custom events carry no personal data.
    const text = JSON.stringify(e);
    assert.ok(!/"(email|phone|name)"\s*:/.test(text), `${where} custom event carries personal data`);
  }
  assert.ok(JSON.stringify(d).length <= 8 * 1024, where);
}

test("money is converted from minor to major units without float drift", () => {
  assert.equal(toMajor(9990), 99.9);
  assert.equal(toMajor(1990), 19.9);
  assert.equal(toMajor(29970), 299.7);
  assert.equal(toMajor(1), 0.01);
  assert.equal(toMajor(undefined), undefined);
});

test("every event of a full flow maps to a valid Centralis v1 event", async () => {
  const db = await freshDb();
  const config = testConfig();
  const joao = await newUser(db, config, "João", "joao@exemplo.com");
  const promoted = await promote(db, config, joao, "JOAO");
  const b = await browser(db, config);
  await landWithRef(db, config, b, "JOAO");
  await enqueue(db, config, "page_view", { visitor_id: b.visitorId, session_id: b.sessionId, page: "/" });
  const maria = await newUser(db, config, "Maria", "(11) 98765-4321", b.visitorId);
  const { transactionId } = await buy(db, config, maria, { visitorId: b.visitorId });
  await buy(db, config, joao, { plan: "mensal" });
  const [sub] = await db.query<{ provider_subscription_id: string }>(`select provider_subscription_id from lastro.subscriptions`);
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "rn", type: "subscription.renewed", providerSubscriptionId: sub.provider_subscription_id, transactionId: "tx_rn", amountMinor: 1990, currency: "BRL", occurredAt: new Date() });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "f", type: "payment.failed", providerSubscriptionId: sub.provider_subscription_id, occurredAt: new Date() });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "c", type: "subscription.cancelled", providerSubscriptionId: sub.provider_subscription_id, occurredAt: new Date() });
  await handlePaymentEvent(db, config, "sandbox", { providerEventId: "r", type: "payment.refunded", refundedTransactionId: transactionId, amountMinor: 9990, currency: "BRL", occurredAt: new Date() });
  await handleCentralisAction(db, config, JSON.stringify(action(config, "affiliate.suspend", { centralis_affiliate_id: promoted.body.result?.centralis_affiliate_id })));

  const all = (await outbox(db)).map((e) => toCentralisV1(e.payload as unknown as Envelope));
  const types = new Set(all.map((e) => e.type));
  for (const t of ["user_updated", "signup", "affiliate_click", "page_view", "session_start", "checkout_start", "purchase", "refund", "subscription_started", "subscription_renewed", "subscription_cancelled", "affiliate.promoted", "affiliate.suspended", "affiliate.attributed", "payment.failed"]) {
    assert.ok(types.has(t), `missing ${t}`);
  }
  for (const e of all) assertCentralisValid(e);

  const purchases = all.filter((e) => e.type === "purchase");
  const first = purchases.find((p) => p.user?.id === maria)!;
  assert.deepEqual([first.data?.amount, first.data?.currency, first.data?.affiliate_code, first.data?.plan], [99.9, "BRL", "JOAO", "vitalicio"]);
  const renewal = purchases.find((p) => p.data?.kind === "renewal")!;
  assert.equal(renewal.data?.amount, 19.9);
  assert.ok(renewal.data?.subscription_id, "renewal links to its subscription");
  const refund = all.find((e) => e.type === "refund")!;
  assert.equal(refund.data?.order_id, first.data?.order_id, "refund points at the purchase's order_id");
  const signup = all.find((e) => e.type === "signup" && e.user?.id === maria)!;
  assert.deepEqual([signup.user?.email, signup.user?.phone, signup.data?.affiliate_code, signup.visitor_id], [undefined, "+5511987654321", "JOAO", b.visitorId]);
  const click = all.find((e) => e.type === "affiliate_click")!;
  assert.deepEqual([click.data?.code, click.visitor_id, click.page?.path, click.utm?.source], ["JOAO", b.visitorId, "/", "instagram"]);
});
