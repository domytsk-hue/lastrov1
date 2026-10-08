import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue } from "../centralis/outbox.ts";
import { createUserSync } from "../centralis/user-sync.ts";
import { latestValidAttribution } from "../tracking/attribution.ts";
import { HOLDINGS, getAccess, grantForCharge, refreshUserPlan, revokeForCharge } from "../access/entitlements.ts";
import { PLANS, isPlanId, type PlanDefinition } from "../../config/plans.ts";
import type { PaymentEvent } from "./provider.ts";

/**
 * OrderService + CentralisPurchaseSync — the only path from money to access.
 *
 *   checkout → order (pending) ……… checkout.started (not a purchase)
 *   verified gateway event → amount & currency checked → charge (unique per transaction)
 *     → entitlement → plan mirrored → purchase event queued — all in ONE transaction.
 *
 * Nothing else can approve an order: no success page, no client call, no "já paguei".
 * Centralis receives the amount the gateway confirmed; it — not Lastro — computes commissions.
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
  purpose: "new" | "upgrade";
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

const fromCatalog = (p: PlanDefinition): Plan => ({ id: p.id, name: p.name, amount_minor: p.amountMinor, currency: p.currency, billing: p.billing, active: true });

/**
 * A plan by id. Price and billing come from the catalog (src/config/plans.ts); the database
 * row must exist and be active (orders reference it).
 */
export async function getPlan(db: Db, planId: string): Promise<Plan | null> {
  if (!isPlanId(planId)) return null;
  const [row] = await db.query<{ active: boolean }>(`select active from lastro.plans where id = $1`, [planId]);
  return row?.active ? fromCatalog(PLANS[planId]) : null;
}

const affiliateRef = async (db: Db, affiliateId: string | null) => {
  if (!affiliateId) return null;
  const [a] = await db.query<{ centralis_affiliate_id: string; code: string }>(`select centralis_affiliate_id, code from lastro.affiliates where id = $1`, [affiliateId]);
  return a ? { centralis_affiliate_id: a.centralis_affiliate_id, code: a.code } : null;
};

/** The gateway must try again later (e.g. a refund that arrived before its payment). */
export class RetryLater extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RetryLater";
  }
}

async function openReview(
  db: Db,
  r: { kind: "amount_mismatch" | "duplicate_purchase" | "unknown_order" | "cancel_renewal" | "unhandled_event"; userId?: string | null; orderId?: string | null; chargeId?: string | null; subscriptionId?: string | null; provider: string; transactionId?: string | null; detail?: Record<string, unknown>; retry?: boolean },
) {
  await db.query(
    `insert into lastro.payment_reviews (id, kind, user_id, order_id, charge_id, subscription_id, provider, gateway_transaction_id, detail, next_attempt_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [randomUUID(), r.kind, r.userId ?? null, r.orderId ?? null, r.chargeId ?? null, r.subscriptionId ?? null, r.provider, r.transactionId ?? null, JSON.stringify(r.detail ?? {}), r.retry ? new Date() : null],
  );
}

/* ------------------------------- purchase payloads ------------------------------- */

async function purchaseBody(db: Db, charge: Charge, order: Order, plan: Plan, paidAt: Date) {
  return {
    user: { external_user_id: order.user_id },
    visitor_id: order.visitor_id,
    order: {
      external_order_id: order.id,
      external_charge_id: charge.id,
      external_subscription_id: charge.subscription_id,
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

export type HandleResult = "applied" | "duplicate" | "ignored" | "review";

/**
 * Applies one verified gateway event. Idempotent twice over: the gateway event id, and the
 * unique (provider, transaction id) on charges — a duplicated webhook creates one purchase.
 * Throws RetryLater (and records nothing) when the event can't be applied YET.
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
      case "payment.expired":
        return expired(tx, provider, ev);
      case "subscription.cancelled":
        return cancelSubscription(tx, config, provider, ev);
      case "unhandled":
        // Authentic but unknown to Lastro (e.g. a gateway event renamed): a person looks at it.
        await openReview(tx, { kind: "unhandled_event", provider, transactionId: ev.transactionId ?? null, detail: { event: ev.gatewayEventName ?? null, order_ref: ev.orderId ?? null } });
        return "review";
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

/** The gateway must confirm exactly what the order asked for. */
function amountMatches(ev: PaymentEvent, expected: { amount_minor: number; currency: string }) {
  return ev.amountMinor === expected.amount_minor && (ev.currency ?? "").toUpperCase() === expected.currency.toUpperCase();
}

/**
 * When a hosted checkout lost our order reference, the buyer's e-mail (as typed on the
 * gateway's page) may still lead to the account's order: its open order first, else its paid
 * monthly order (a renewal). Used in memory only.
 */
async function findOrderByBuyer(db: Db, provider: string, ev: PaymentEvent): Promise<Order | undefined> {
  if (!ev.customerEmail) return undefined;
  const [o] = await db.query<Order>(
    `select o.* from lastro.orders o join lastro.users u on u.id = o.user_id
      where o.provider = $1 and u.email = $2 and ($3::text is null or o.plan_id = $3)
        and (o.status = 'pending' or (o.status = 'approved' and o.plan_id = 'mensal'))
      order by (o.status = 'pending') desc, o.created_at desc
      limit 1
      for update of o`,
    [provider, ev.customerEmail, ev.planId && ev.planId !== "unknown" ? ev.planId : null],
  );
  return o;
}

async function approveInitial(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.transactionId) return "ignored";
  let order: Order | undefined;
  if (ev.orderId) [order] = await db.query<Order>(`select * from lastro.orders where id = $1 and provider = $2 for update`, [ev.orderId, provider]);
  order ??= await findOrderByBuyer(db, provider, ev);
  if (!order) {
    await openReview(db, { kind: "unknown_order", provider, transactionId: ev.transactionId, detail: { order_id: ev.orderId ?? null, plan_id: ev.planId ?? null, amount_minor: ev.amountMinor ?? null, currency: ev.currency ?? null } });
    return "review";
  }
  if (ev.planId && ev.planId !== order.plan_id) {
    // The gateway sold a different plan (or product) than this order: no access, a person decides.
    await openReview(db, { kind: "amount_mismatch", userId: order.user_id, orderId: order.id, provider, transactionId: ev.transactionId, detail: { expected_plan: order.plan_id, received_plan: ev.planId } });
    return "review";
  }
  if (order.status === "approved") {
    const [same] = await db.query(`select 1 from lastro.charges where provider = $1 and gateway_transaction_id = $2`, [provider, ev.transactionId]);
    if (same) return "duplicate";
    // A new paid month of an approved monthly order: the gateway renewed it (e.g. a Kirvano subscription).
    if (order.plan_id === "mensal") {
      if (!amountMatches(ev, order)) {
        await openReview(db, { kind: "amount_mismatch", userId: order.user_id, orderId: order.id, provider, transactionId: ev.transactionId, detail: { expected_minor: order.amount_minor, received_minor: ev.amountMinor ?? null, renewal: true } });
        return "review";
      }
      return renewOrder(db, config, provider, order, ev);
    }
  }
  if (ev.method) await db.query(`update lastro.orders set payment_method = coalesce(payment_method, $2) where id = $1`, [order.id, ev.method]);
  if (!amountMatches(ev, order)) {
    // Money arrived, but not the money this order asked for: a person decides. No access.
    await openReview(db, {
      kind: "amount_mismatch",
      userId: order.user_id,
      orderId: order.id,
      provider,
      transactionId: ev.transactionId,
      detail: { expected_minor: order.amount_minor, expected_currency: order.currency, received_minor: ev.amountMinor ?? null, received_currency: ev.currency ?? null },
    });
    return "review";
  }
  const plan = (await getPlan(db, order.plan_id)) as Plan;
  const before = await getAccess(db, order.user_id, ev.occurredAt, HOLDINGS);

  // Attribution is decided at payment time: last valid click for this buyer, if any.
  const attribution = await latestValidAttribution(db, { userId: order.user_id, visitorId: order.visitor_id }, ev.occurredAt);

  let subscriptionId: string | null = null;
  if (plan.billing === "monthly" && ev.providerSubscriptionId) {
    const [sub] = await db.query<{ id: string }>(
      `insert into lastro.subscriptions (id, user_id, plan_id, order_id, provider, provider_subscription_id, status, current_period_start, current_period_end)
       values ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
       on conflict (provider, provider_subscription_id) do update set status = 'active', updated_at = now() returning id`,
      [randomUUID(), order.user_id, plan.id, order.id, provider, ev.providerSubscriptionId, ev.periodStart ?? null, ev.periodEnd ?? null],
    );
    subscriptionId = sub.id;
  }

  const charge = await insertCharge(db, {
    order_id: order.id,
    subscription_id: subscriptionId,
    provider,
    gateway_transaction_id: ev.transactionId,
    kind: "initial",
    amount_minor: ev.amountMinor as number,
    currency: (ev.currency as string).toUpperCase(),
    affiliate_id: attribution?.affiliate_id ?? null,
    affiliate_code: attribution?.code ?? null,
    paidAt: ev.occurredAt,
  });
  if (!charge) return "duplicate";

  // A superseded order paid late is still money received: it is honored, never dropped.
  await db.query(`update lastro.orders set status = 'approved', status_reason = case when status = 'cancelled' then 'paid_after_cancel' else status_reason end, updated_at = now() where id = $1`, [order.id]);

  const period = await grantForCharge(db, { userId: order.user_id, chargeId: charge.id, planId: plan.id, billing: plan.billing, source: "purchase", paidAt: ev.occurredAt, periodStart: ev.periodStart, periodEnd: ev.periodEnd });
  if (subscriptionId && period.endsAt && !ev.periodEnd) {
    await db.query(`update lastro.subscriptions set current_period_start = coalesce(current_period_start, $2), current_period_end = $3 where id = $1`, [subscriptionId, period.startsAt, period.endsAt]);
  }

  // Bought something the account already had: keep everything, flag it for a person.
  if (before.state === "lifetime" || (plan.id === "mensal" && before.state === "monthly")) {
    await openReview(db, { kind: "duplicate_purchase", userId: order.user_id, orderId: order.id, chargeId: charge.id, provider, transactionId: ev.transactionId, detail: { plan_id: plan.id, had: before.state } });
  }

  // Upgrade confirmed: the lifetime is effective now; stop the monthly renewals (best effort,
  // retried, never claimed before the gateway confirms). The paid month is not taken away.
  if (plan.id === "vitalicio") {
    const subs = await db.query<{ id: string }>(
      `select id from lastro.subscriptions where user_id = $1 and plan_id = 'mensal' and status in ('active', 'past_due') and not cancel_at_period_end`,
      [order.user_id],
    );
    for (const s of subs) {
      const [open] = await db.query(`select 1 from lastro.payment_reviews where subscription_id = $1 and kind = 'cancel_renewal' and status = 'open'`, [s.id]);
      if (!open) await openReview(db, { kind: "cancel_renewal", userId: order.user_id, orderId: order.id, subscriptionId: s.id, provider, retry: true, detail: { reason: "upgrade_to_lifetime" } });
    }
    // The gateway renews the monthly plan by itself and has no API to stop it (Kirvano): a person
    // cancels it there. Until resolved, the profile says the cancellation is in progress.
    if (ev.gatewayRenewsMonthly) {
      const monthly = await db.query<{ id: string }>(
        `select o.id from lastro.orders o
          where o.user_id = $1 and o.provider = $2 and o.plan_id = 'mensal' and o.status = 'approved'
            and not exists (select 1 from lastro.payment_reviews r where r.order_id = o.id and r.kind = 'cancel_renewal')`,
        [order.user_id, provider],
      );
      for (const m of monthly) {
        await openReview(db, { kind: "cancel_renewal", userId: order.user_id, orderId: m.id, provider, detail: { reason: "upgrade_to_lifetime", manual: true, upgrade_order_id: order.id } });
      }
    }
  }

  const [u] = await db.query<{ subscription_status: string | null }>(`select subscription_status from lastro.users where id = $1 for update`, [order.user_id]);
  if (subscriptionId && u.subscription_status !== "active") await db.query(`update lastro.users set subscription_status = 'active', updated_at = now() where id = $1`, [order.user_id]);

  await enqueue(db, config, "purchase", await purchaseBody(db, charge, order, plan, ev.occurredAt), ev.occurredAt);
  await refreshUserPlan(db, config, order.user_id, ev.occurredAt);
  if (subscriptionId) {
    await enqueue(db, config, "subscription.created", {
      user: { external_user_id: order.user_id },
      subscription: { external_subscription_id: subscriptionId, plan_id: plan.id, plan_name: plan.name, amount_minor: charge.amount_minor, currency: charge.currency, status: "active" },
      order: { external_order_id: order.id },
    });
    await createUserSync(config).subscriptionChanged(db, order.user_id);
  }
  return "applied";
}

async function renew(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.providerSubscriptionId || !ev.transactionId) return "ignored";
  const [sub] = await db.query<{ id: string; user_id: string; plan_id: string; order_id: string; status: string }>(
    `select id, user_id, plan_id, order_id, status from lastro.subscriptions where provider = $1 and provider_subscription_id = $2 for update`,
    [provider, ev.providerSubscriptionId],
  );
  // The first payment hasn't been processed yet: let the gateway deliver this again later.
  if (!sub) throw new RetryLater("renewal before subscription");
  const [order] = await db.query<Order>(`select * from lastro.orders where id = $1`, [sub.order_id]);
  const plan = (await getPlan(db, sub.plan_id)) as Plan;
  if (!amountMatches(ev, order)) {
    await openReview(db, {
      kind: "amount_mismatch",
      userId: sub.user_id,
      orderId: order.id,
      subscriptionId: sub.id,
      provider,
      transactionId: ev.transactionId,
      detail: { expected_minor: order.amount_minor, expected_currency: order.currency, received_minor: ev.amountMinor ?? null, received_currency: ev.currency ?? null, renewal: true },
    });
    return "review";
  }
  const before = await getAccess(db, sub.user_id, ev.occurredAt, HOLDINGS);
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
    amount_minor: ev.amountMinor as number,
    currency: (ev.currency as string).toUpperCase(),
    affiliate_id: first?.affiliate_id ?? null,
    affiliate_code: first?.affiliate_code ?? null,
    paidAt: ev.occurredAt,
  });
  if (!charge) return "duplicate";
  const period = await grantForCharge(db, { userId: sub.user_id, chargeId: charge.id, planId: plan.id, billing: plan.billing, source: "renewal", paidAt: ev.occurredAt, periodStart: ev.periodStart, periodEnd: ev.periodEnd });
  await db.query(
    `update lastro.subscriptions set status = case when status = 'cancelled' then status else 'active' end, current_period_start = $2, current_period_end = $3, updated_at = now() where id = $1`,
    [sub.id, period.startsAt, period.endsAt],
  );
  if (before.state === "lifetime") {
    // Charged for a month while already lifetime (renewal raced the upgrade): flag, don't refund silently.
    await openReview(db, { kind: "duplicate_purchase", userId: sub.user_id, orderId: sub.order_id, chargeId: charge.id, subscriptionId: sub.id, provider, transactionId: ev.transactionId, detail: { plan_id: plan.id, had: "lifetime", renewal: true } });
  }
  const [u] = await db.query<{ subscription_status: string | null }>(`select subscription_status from lastro.users where id = $1 for update`, [sub.user_id]);
  if (sub.status !== "cancelled" && u.subscription_status !== "active") {
    await db.query(`update lastro.users set subscription_status = 'active', updated_at = now() where id = $1`, [sub.user_id]);
    await createUserSync(config).subscriptionChanged(db, sub.user_id);
  }

  await enqueue(db, config, "purchase", await purchaseBody(db, charge, order, plan, ev.occurredAt), ev.occurredAt);
  await enqueue(db, config, "subscription.renewed", {
    user: { external_user_id: sub.user_id },
    subscription: { external_subscription_id: sub.id, plan_id: plan.id, plan_name: plan.name, status: "active" },
    order: { external_order_id: sub.order_id, external_charge_id: charge.id },
  });
  await refreshUserPlan(db, config, sub.user_id, ev.occurredAt);
  return "applied";
}

/** One more paid month on an approved monthly order (gateway-side renewal without a Lastro subscription). */
async function renewOrder(db: Db, config: CentralisConfig, provider: string, order: Order, ev: PaymentEvent): Promise<HandleResult> {
  const plan = (await getPlan(db, order.plan_id)) as Plan;
  const before = await getAccess(db, order.user_id, ev.occurredAt, HOLDINGS);
  const [first] = await db.query<{ affiliate_id: string | null; affiliate_code: string | null }>(
    `select affiliate_id, affiliate_code from lastro.charges where order_id = $1 and kind = 'initial' limit 1`,
    [order.id],
  );
  const charge = await insertCharge(db, {
    order_id: order.id,
    subscription_id: null,
    provider,
    gateway_transaction_id: ev.transactionId as string,
    kind: "renewal",
    amount_minor: ev.amountMinor as number,
    currency: (ev.currency as string).toUpperCase(),
    affiliate_id: first?.affiliate_id ?? null,
    affiliate_code: first?.affiliate_code ?? null,
    paidAt: ev.occurredAt,
  });
  if (!charge) return "duplicate";
  await grantForCharge(db, { userId: order.user_id, chargeId: charge.id, planId: plan.id, billing: plan.billing, source: "renewal", paidAt: ev.occurredAt, periodStart: ev.periodStart, periodEnd: ev.periodEnd });
  if (before.state === "lifetime") {
    await openReview(db, { kind: "duplicate_purchase", userId: order.user_id, orderId: order.id, chargeId: charge.id, provider, transactionId: ev.transactionId, detail: { plan_id: plan.id, had: "lifetime", renewal: true } });
  }
  await enqueue(db, config, "purchase", await purchaseBody(db, charge, order, plan, ev.occurredAt), ev.occurredAt);
  await refreshUserPlan(db, config, order.user_id, ev.occurredAt);
  return "applied";
}

async function refund(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  const txId = ev.refundedTransactionId ?? ev.transactionId;
  if (!txId) return "ignored";
  // The charge refunded: the transaction itself or, when the gateway keys subscription cycles as
  // "<sale>:<cycle>" (Kirvano), the most recent paid cycle of that sale.
  const [known] = await db.query<{ id: string; status: string }>(
    `select id, status from lastro.charges
      where provider = $1 and (gateway_transaction_id = $2 or left(gateway_transaction_id, length($2) + 1) = $2 || ':')
      order by (status = 'approved') desc, paid_at desc limit 1`,
    [provider, txId],
  );
  if (!known) {
    // A refund of money that never became a charge (e.g. an amount under review): add it there.
    const [review] = await db.query<{ id: string }>(
      `update lastro.payment_reviews set detail = detail || jsonb_build_object('refunded_at', $3::text) where provider = $1 and gateway_transaction_id = $2 returning id`,
      [provider, txId, ev.occurredAt.toISOString()],
    );
    if (review) return "review";
    // The refund overtook its payment: apply it after the payment, never before.
    throw new RetryLater("refund before payment");
  }
  const [charge] = await db.query<Charge>(
    `update lastro.charges set status = 'refunded', refunded_at = $2 where id = $1 and status = 'approved' returning *`,
    [known.id, ev.occurredAt],
  );
  if (!charge) return "duplicate";
  const [order] = await db.query<Order>(`select * from lastro.orders where id = $1`, [charge.order_id]);
  const plan = (await getPlan(db, order.plan_id)) as Plan;

  // Only THIS charge's access goes away. Other entitlements (e.g. a lifetime) are untouched.
  await revokeForCharge(db, charge.id, ev.refundReason ?? "refund", ev.occurredAt);
  if (charge.kind === "initial") {
    await db.query(`update lastro.orders set status = 'refunded', updated_at = now() where id = $1`, [order.id]);
    if (charge.subscription_id) {
      await db.query(`update lastro.subscriptions set status = 'cancelled', updated_at = now() where id = $1`, [charge.subscription_id]);
      await db.query(`update lastro.users set subscription_status = 'cancelled', updated_at = now() where id = $1`, [order.user_id]);
      await createUserSync(config).subscriptionChanged(db, order.user_id);
    }
  }
  await refreshUserPlan(db, config, order.user_id, ev.occurredAt);

  await enqueue(db, config, "refund", {
    user: { external_user_id: order.user_id },
    refund: {
      external_refund_id: ev.providerEventId,
      amount_minor: ev.amountMinor ?? charge.amount_minor,
      currency: ev.currency ?? charge.currency,
      refunded_at: ev.occurredAt.toISOString(),
      reason: ev.refundReason ?? "refund",
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
      `update lastro.subscriptions set status = 'past_due', updated_at = now() where provider = $1 and provider_subscription_id = $2 and status = 'active' returning id, user_id, order_id`,
      [provider, ev.providerSubscriptionId],
    );
    if (sub) {
      // A failed renewal does not take away time already paid; the period ends on its own.
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

async function expired(db: Db, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.orderId) return "ignored";
  const [o] = await db.query(
    `update lastro.orders set status = 'expired', updated_at = now() where id = $1 and provider = $2 and status = 'pending' returning id`,
    [ev.orderId, provider],
  );
  return o ? "applied" : "ignored";
}

async function cancelSubscription(db: Db, config: CentralisConfig, provider: string, ev: PaymentEvent): Promise<HandleResult> {
  if (!ev.providerSubscriptionId) return "ignored";
  const [sub] = await db.query<{ id: string; user_id: string; plan_id: string }>(
    `update lastro.subscriptions set status = 'cancelled', updated_at = now()
      where provider = $1 and provider_subscription_id = $2 and status <> 'cancelled' returning id, user_id, plan_id`,
    [provider, ev.providerSubscriptionId],
  );
  if (!sub) return "duplicate";
  // Renewals stop; the month already paid stays (its entitlement keeps its end date).
  await db.query(`update lastro.payment_reviews set status = 'resolved', resolved_at = now() where subscription_id = $1 and kind = 'cancel_renewal' and status = 'open'`, [sub.id]);
  await db.query(`update lastro.users set subscription_status = 'cancelled', updated_at = now() where id = $1`, [sub.user_id]);
  await enqueue(db, config, "subscription.cancelled", {
    user: { external_user_id: sub.user_id },
    subscription: { external_subscription_id: sub.id, plan_id: sub.plan_id, status: "cancelled" },
  }, ev.occurredAt);
  await createUserSync(config).subscriptionChanged(db, sub.user_id);
  return "applied";
}
