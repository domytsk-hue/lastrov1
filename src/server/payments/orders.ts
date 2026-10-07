import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue } from "../centralis/outbox.ts";
import { createUserSync } from "../centralis/user-sync.ts";
import { latestValidAttribution } from "../tracking/attribution.ts";
import type { PaymentEvent } from "./provider.ts";

/**
 * OrderService + CentralisPurchaseSync.
 *
 *   checkout → order (pending) ……… checkout.started (not a purchase)
 *   gateway webhook (verified) → charge (approved, unique per transaction) → plan released
 *     → attribution checked → purchase event queued — all in ONE transaction.
 *
 * Nothing else can approve an order: no success page, no client call. Centralis receives the
 * amount the gateway confirmed; it — not Lastro — computes commissions.
 */

export interface Plan {
  id: string;
  name: string;
  amount_minor: number;
  currency: string;
  billing: "one_time" | "monthly";
  active: boolean;
}

interface Order {
  id: string;
  user_id: string;
  plan_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  provider: string;
  visitor_id: string | null;
}

interface Charge {
  id: string;
  order_id: string;
  subscription_id: string | null;
  gateway_transaction_id: string;
  kind: "initial" | "renewal";
  amount_minor: number;
  currency: string;
  status: string;
  affiliate_id: string | null;
  affiliate_code: string | null;
}

export async function getPlan(db: Db, planId: string): Promise<Plan | null> {
  const [p] = await db.query<Plan>(`select * from lastro.plans where id = $1`, [planId]);
  return p ?? null;
}

const affiliateRef = async (db: Db, affiliateId: string | null) => {
  if (!affiliateId) return null;
  const [a] = await db.query<{ centralis_affiliate_id: string; code: string }>(`select centralis_affiliate_id, code from lastro.affiliates where id = $1`, [affiliateId]);
  return a ? { centralis_affiliate_id: a.centralis_affiliate_id, code: a.code } : null;
};

/* ----------------------------------- checkout ----------------------------------- */

/** Creates a pending order. The price always comes from the plans table, never the client. */
export async function startCheckout(db: Db, config: CentralisConfig, userId: string, planId: string, provider: string, visitorId: string | null) {
  const plan = await getPlan(db, planId);
  if (!plan || !plan.active) return { ok: false as const, error: "plan_not_found" };
  return db.tx(async (tx) => {
    const orderId = randomUUID();
    await tx.query(
      `insert into lastro.orders (id, user_id, plan_id, amount_minor, currency, status, provider, visitor_id) values ($1, $2, $3, $4, $5, 'pending', $6, $7)`,
      [orderId, userId, plan.id, plan.amount_minor, plan.currency, provider, visitorId],
    );
    const attribution = await latestValidAttribution(tx, { userId, visitorId });
    await enqueue(tx, config, "checkout.started", {
      user: { external_user_id: userId },
      visitor_id: visitorId,
      order: { external_order_id: orderId, plan_id: plan.id, plan_name: plan.name, amount_minor: plan.amount_minor, currency: plan.currency, status: "pending" },
      affiliate: attribution ? { centralis_affiliate_id: attribution.centralis_affiliate_id, code: attribution.code } : null,
    });
    return { ok: true as const, orderId, plan };
  });
}

export async function attachCheckout(db: Db, orderId: string, providerCheckoutId: string) {
  await db.query(`update lastro.orders set provider_checkout_id = $2, updated_at = now() where id = $1`, [orderId, providerCheckoutId]);
}

/* ------------------------------- purchase payloads ------------------------------- */

async function purchaseBody(db: Db, charge: Charge, order: Order, plan: Plan, paidAt: Date) {
  return {
    user: { external_user_id: order.user_id },
    visitor_id: order.visitor_id,
    order: {
      external_order_id: order.id,
      external_charge_id: charge.id,
      gateway: order.provider,
      gateway_transaction_id: charge.gateway_transaction_id,
      kind: charge.kind,
      plan_id: plan.id,
      plan_name: plan.name,
      billing: plan.billing,
      amount_minor: charge.amount_minor,
      currency: charge.currency,
      status: "approved",
      paid_at: paidAt.toISOString(),
    },
    affiliate: await affiliateRef(db, charge.affiliate_id),
  };
}

/* ----------------------------------- webhooks ----------------------------------- */

export type HandleResult = "applied" | "duplicate" | "ignored";

/**
 * Applies one verified gateway event. Idempotent twice over: the gateway event id, and the
 * unique (provider, transaction id) on charges — a duplicated webhook creates one purchase.
 */
export async function handlePaymentEvent(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  return db.tx(async (tx) => {
    const fresh = await tx.query(
      `insert into lastro.processed_webhooks (provider, provider_event_id) values ($1, $2) on conflict do nothing returning provider`,
      [provider, ev.providerEventId],
    );
    if (!fresh.length) return "duplicate";

    switch (ev.type) {
      case "payment.pending":
        return "ignored"; // a pending payment is not a purchase
      case "payment.approved":
        return approveInitial(tx, config, provider, ev);
      case "subscription.renewed":
        return renew(tx, config, provider, ev);
      case "payment.refunded":
        return refund(tx, config, provider, ev);
      case "payment.failed":
        return failed(tx, config, provider, ev);
      case "subscription.cancelled":
        return cancelSubscription(tx, config, provider, ev);
    }
  });
}

async function insertCharge(db: Db, c: Omit<Charge, "id" | "status"> & { provider: string; paidAt: Date }): Promise<Charge | null> {
  const [row] = await db.query<Charge>(
    `insert into lastro.charges (id, order_id, subscription_id, provider, gateway_transaction_id, kind, amount_minor, currency, status, affiliate_id, affiliate_code, paid_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11)
     on conflict (provider, gateway_transaction_id) do nothing returning *`,
    [randomUUID(), c.order_id, c.subscription_id, c.provider, c.gateway_transaction_id, c.kind, c.amount_minor, c.currency, c.affiliate_id, c.affiliate_code, c.paidAt],
  );
  return row ?? null;
}

async function approveInitial(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.orderId || !ev.transactionId) return "ignored";
  const [order] = await db.query<Order>(`select * from lastro.orders where id = $1 and provider = $2 for update`, [ev.orderId, provider]);
  if (!order) return "ignored";
  const plan = (await getPlan(db, order.plan_id)) as Plan;

  // Attribution is decided at payment time: last valid click for this buyer, if any.
  const attribution = await latestValidAttribution(db, { userId: order.user_id, visitorId: order.visitor_id }, ev.occurredAt);

  let subscriptionId: string | null = null;
  if (plan.billing === "monthly" && ev.providerSubscriptionId) {
    subscriptionId = randomUUID();
    const [sub] = await db.query<{ id: string }>(
      `insert into lastro.subscriptions (id, user_id, plan_id, order_id, provider, provider_subscription_id, status)
       values ($1, $2, $3, $4, $5, $6, 'active')
       on conflict (provider, provider_subscription_id) do update set status = 'active', updated_at = now() returning id`,
      [subscriptionId, order.user_id, plan.id, order.id, provider, ev.providerSubscriptionId],
    );
    subscriptionId = sub.id;
  }

  const charge = await insertCharge(db, {
    order_id: order.id,
    subscription_id: subscriptionId,
    provider,
    gateway_transaction_id: ev.transactionId,
    kind: "initial",
    // The value the gateway actually confirmed is the value we recognize.
    amount_minor: ev.amountMinor ?? order.amount_minor,
    currency: ev.currency ?? order.currency,
    affiliate_id: attribution?.affiliate_id ?? null,
    affiliate_code: attribution?.code ?? null,
    paidAt: ev.occurredAt,
  });
  if (!charge) return "duplicate";

  await db.query(`update lastro.orders set status = 'approved', updated_at = now() where id = $1`, [order.id]);

  // Release access under the product's rules: the user now holds this plan.
  const [before] = await db.query<{ plan_id: string | null; subscription_status: string | null }>(`select plan_id, subscription_status from lastro.users where id = $1 for update`, [order.user_id]);
  await db.query(
    `update lastro.users set plan_id = $2, subscription_status = $3, updated_at = now() where id = $1`,
    [order.user_id, plan.id, plan.billing === "monthly" ? "active" : before.subscription_status],
  );

  await enqueue(db, config, "purchase", await purchaseBody(db, charge, order, plan, ev.occurredAt), ev.occurredAt);
  const sync = createUserSync(config);
  if (before.plan_id !== plan.id) await sync.planChanged(db, order.user_id, before.plan_id);
  if (subscriptionId) {
    await enqueue(db, config, "subscription.created", {
      user: { external_user_id: order.user_id },
      subscription: { external_subscription_id: subscriptionId, plan_id: plan.id, plan_name: plan.name, status: "active" },
      order: { external_order_id: order.id },
    });
    await sync.subscriptionChanged(db, order.user_id);
  }
  return "applied";
}

async function renew(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.providerSubscriptionId || !ev.transactionId) return "ignored";
  const [sub] = await db.query<{ id: string; user_id: string; plan_id: string; order_id: string }>(
    `select id, user_id, plan_id, order_id from lastro.subscriptions where provider = $1 and provider_subscription_id = $2 for update`,
    [provider, ev.providerSubscriptionId],
  );
  if (!sub) return "ignored";
  const [order] = await db.query<Order>(`select * from lastro.orders where id = $1`, [sub.order_id]);
  const plan = (await getPlan(db, sub.plan_id)) as Plan;
  // Report the attribution the subscription was born with; Centralis decides whether
  // recurring charges pay commission.
  const [first] = await db.query<{ affiliate_id: string | null; affiliate_code: string | null }>(
    `select affiliate_id, affiliate_code from lastro.charges where subscription_id = $1 and kind = 'initial' limit 1`,
    [sub.id],
  );
  const charge = await insertCharge(db, {
    order_id: sub.order_id,
    subscription_id: sub.id,
    provider,
    gateway_transaction_id: ev.transactionId,
    kind: "renewal",
    amount_minor: ev.amountMinor ?? plan.amount_minor,
    currency: ev.currency ?? plan.currency,
    affiliate_id: first?.affiliate_id ?? null,
    affiliate_code: first?.affiliate_code ?? null,
    paidAt: ev.occurredAt,
  });
  if (!charge) return "duplicate";
  const wasPastDue = (await db.query<{ status: string }>(`select status from lastro.subscriptions where id = $1`, [sub.id]))[0].status !== "active";
  await db.query(`update lastro.subscriptions set status = 'active', updated_at = now() where id = $1`, [sub.id]);
  await db.query(`update lastro.users set subscription_status = 'active', updated_at = now() where id = $1`, [sub.user_id]);

  await enqueue(db, config, "purchase", await purchaseBody(db, charge, order, plan, ev.occurredAt), ev.occurredAt);
  await enqueue(db, config, "subscription.renewed", {
    user: { external_user_id: sub.user_id },
    subscription: { external_subscription_id: sub.id, plan_id: plan.id, plan_name: plan.name, status: "active" },
    order: { external_order_id: sub.order_id, external_charge_id: charge.id },
  });
  if (wasPastDue) await createUserSync(config).subscriptionChanged(db, sub.user_id);
  return "applied";
}

async function refund(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  const tx = ev.refundedTransactionId ?? ev.transactionId;
  if (!tx) return "ignored";
  const [charge] = await db.query<Charge>(
    `update lastro.charges set status = 'refunded', refunded_at = $3 where provider = $1 and gateway_transaction_id = $2 and status = 'approved' returning *`,
    [provider, tx, ev.occurredAt],
  );
  if (!charge) return "duplicate";
  const [order] = await db.query<Order>(`select * from lastro.orders where id = $1`, [charge.order_id]);
  const plan = (await getPlan(db, order.plan_id)) as Plan;

  if (charge.kind === "initial") {
    await db.query(`update lastro.orders set status = 'refunded', updated_at = now() where id = $1`, [order.id]);
    // The refunded plan is no longer held (only if it is still the user's current plan).
    const [u] = await db.query<{ plan_id: string | null }>(`select plan_id from lastro.users where id = $1 for update`, [order.user_id]);
    if (u.plan_id === plan.id) {
      await db.query(
        `update lastro.users set plan_id = null, subscription_status = case when $2 then 'cancelled' else subscription_status end, updated_at = now() where id = $1`,
        [order.user_id, plan.billing === "monthly"],
      );
      if (charge.subscription_id) await db.query(`update lastro.subscriptions set status = 'cancelled', updated_at = now() where id = $1`, [charge.subscription_id]);
      await createUserSync(config).planChanged(db, order.user_id, plan.id);
    }
  }

  await enqueue(db, config, "refund", {
    user: { external_user_id: order.user_id },
    refund: {
      external_refund_id: ev.providerEventId,
      amount_minor: ev.amountMinor ?? charge.amount_minor,
      currency: ev.currency ?? charge.currency,
      refunded_at: ev.occurredAt.toISOString(),
    },
    original: {
      external_order_id: order.id,
      external_charge_id: charge.id,
      gateway_transaction_id: charge.gateway_transaction_id,
      plan_id: plan.id,
      amount_minor: charge.amount_minor,
      currency: charge.currency,
    },
    affiliate: await affiliateRef(db, charge.affiliate_id),
  }, ev.occurredAt);
  return "applied";
}

async function failed(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  let userId: string | null = null;
  let orderId: string | null = null;
  if (ev.providerSubscriptionId) {
    const [sub] = await db.query<{ id: string; user_id: string; order_id: string }>(
      `update lastro.subscriptions set status = 'past_due', updated_at = now() where provider = $1 and provider_subscription_id = $2 returning id, user_id, order_id`,
      [provider, ev.providerSubscriptionId],
    );
    if (sub) {
      userId = sub.user_id;
      orderId = sub.order_id;
      await db.query(`update lastro.users set subscription_status = 'past_due', updated_at = now() where id = $1`, [sub.user_id]);
      await createUserSync(config).subscriptionChanged(db, sub.user_id);
    }
  } else if (ev.orderId) {
    const [o] = await db.query<{ id: string; user_id: string }>(
      `update lastro.orders set status = 'failed', updated_at = now() where id = $1 and provider = $2 and status = 'pending' returning id, user_id`,
      [ev.orderId, provider],
    );
    if (o) {
      userId = o.user_id;
      orderId = o.id;
    }
  }
  if (!userId) return "ignored";
  await enqueue(db, config, "payment.failed", {
    user: { external_user_id: userId },
    order: { external_order_id: orderId },
    amount_minor: ev.amountMinor ?? null,
    currency: ev.currency ?? null,
  }, ev.occurredAt);
  return "applied";
}

async function cancelSubscription(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.providerSubscriptionId) return "ignored";
  const [sub] = await db.query<{ id: string; user_id: string; plan_id: string }>(
    `update lastro.subscriptions set status = 'cancelled', updated_at = now()
      where provider = $1 and provider_subscription_id = $2 and status <> 'cancelled' returning id, user_id, plan_id`,
    [provider, ev.providerSubscriptionId],
  );
  if (!sub) return "duplicate";
  await db.query(`update lastro.users set subscription_status = 'cancelled', updated_at = now() where id = $1`, [sub.user_id]);
  await enqueue(db, config, "subscription.cancelled", {
    user: { external_user_id: sub.user_id },
    subscription: { external_subscription_id: sub.id, plan_id: sub.plan_id, status: "cancelled" },
  }, ev.occurredAt);
  await createUserSync(config).subscriptionChanged(db, sub.user_id);
  return "applied";
}
