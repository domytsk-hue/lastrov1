import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue } from "../centralis/outbox.ts";
import { latestValidAttribution } from "../tracking/attribution.ts";
import { HOLDINGS, getAccess } from "../access/entitlements.ts";
import { parseBillingName, parseCpf, parseEmail, parsePhone } from "../../lib/billing.ts";
import { getPlan, handlePaymentEvent, type HandleResult, type Plan } from "./orders.ts";
import type { CheckoutResult, PaymentInstructions, PaymentMethod, PaymentProvider } from "./provider.ts";

/**
 * The checkout intent: the browser says WHICH plan and HOW to pay; the server decides who
 * buys (the session), what it costs (the catalog) and which affiliate it is attributed to.
 */

export type CheckoutError =
  | "plan_not_found"
  | "invalid_method"
  | "already_lifetime"
  | "already_monthly"
  | "idempotency_conflict"
  | "invalid_billing";

export interface BillingInput {
  name: unknown;
  cpf: unknown;
  phone: unknown;
  email: unknown;
}

export interface BillingDetails {
  name: string;
  /** 11 digits. Sent to the gateway only; never stored by Lastro. */
  document: string;
  phone: string;
  email: string;
}

/** Server-side validation of the billing form. The account e-mail wins over the typed one. */
export function validateBilling(input: BillingInput, accountEmail: string | null): { ok: true; value: BillingDetails } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = parseBillingName(String(input.name ?? ""));
  const cpf = parseCpf(String(input.cpf ?? ""));
  const phone = parsePhone(String(input.phone ?? ""));
  const email = accountEmail ? ({ ok: true, value: accountEmail } as const) : parseEmail(String(input.email ?? ""));
  if (!name.ok) errors.name = name.error;
  if (!cpf.ok) errors.cpf = cpf.error;
  if (!phone.ok) errors.phone = phone.error;
  if (!email.ok) errors.email = email.error;
  if (!name.ok || !cpf.ok || !phone.ok || !email.ok) return { ok: false, errors };
  return { ok: true, value: { name: name.value, document: cpf.value, phone: phone.value, email: email.value } };
}

export interface OrderRow {
  id: string;
  user_id: string;
  plan_id: string;
  amount_minor: number;
  currency: string;
  status: string;
  provider: string;
  payment_method: PaymentMethod | null;
  purpose: "new" | "upgrade";
  idempotency_key: string | null;
  provider_checkout_id: string | null;
  provider_payment_id: string | null;
  payment_instructions: PaymentInstructions | null;
  expires_at: Date | null;
  visitor_id: string | null;
  created_at: Date;
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;

/**
 * Creates (or finds) the pending order for this intent. One transaction, the user's row
 * locked, so a double click, a refresh, a retry or a second tab can't open two charges:
 *  - same idempotency key → the same order;
 *  - an open order for the same plan and method → that order (and its Pix);
 *  - an open order for something else → superseded (cancelled) by the new intent.
 */
export async function createOrder(
  db: Db,
  config: CentralisConfig,
  input: { userId: string; planId: string; method: string; idempotencyKey: string; visitorId: string | null; provider: Pick<PaymentProvider, "id" | "methods" | "hostedCheckout"> },
  now = new Date(),
): Promise<{ ok: true; order: OrderRow; plan: Plan; reused: boolean } | { ok: false; error: CheckoutError }> {
  const plan = await getPlan(db, input.planId);
  if (!plan) return { ok: false, error: "plan_not_found" };
  // A hosted checkout (Kirvano) lets the buyer choose Pix or card on its own page.
  const method: PaymentMethod | null = input.provider.hostedCheckout ? null : (input.method as PaymentMethod);
  if (method !== null && !input.provider.methods.includes(method)) return { ok: false, error: "invalid_method" };
  const key = IDEMPOTENCY_RE.test(input.idempotencyKey) ? input.idempotencyKey : null;

  return db.tx(async (tx) => {
    await tx.query(`select id from lastro.users where id = $1 for update`, [input.userId]);

    if (key) {
      const [same] = await tx.query<OrderRow>(`select * from lastro.orders where user_id = $1 and idempotency_key = $2`, [input.userId, key]);
      if (same) {
        // A key names one attempt. Reusing it for another intent, or after that attempt ended
        // (failed, expired, superseded), needs a new key.
        if (same.plan_id !== plan.id || same.payment_method !== method || !["pending", "approved"].includes(same.status)) return { ok: false as const, error: "idempotency_conflict" as const };
        return { ok: true as const, order: same, plan, reused: true };
      }
    }

    const access = await getAccess(tx, input.userId, now, HOLDINGS);
    // The only plan change that exists is mensal → vitalício.
    if (access.state === "lifetime") return { ok: false as const, error: "already_lifetime" as const };
    if (plan.id === "mensal" && access.state === "monthly") return { ok: false as const, error: "already_monthly" as const };

    const [open] = await tx.query<OrderRow>(`select * from lastro.orders where user_id = $1 and status = 'pending' for update`, [input.userId]);
    if (open) {
      const stillValid = !open.expires_at || new Date(open.expires_at) > now;
      if (open.plan_id === plan.id && open.payment_method === method && open.provider === input.provider.id && stillValid) {
        return { ok: true as const, order: open, plan, reused: true };
      }
      // A new intent never reuses a charge made for another plan or method.
      await tx.query(`update lastro.orders set status = 'cancelled', status_reason = 'superseded', updated_at = now() where id = $1`, [open.id]);
    }

    const attribution = await latestValidAttribution(tx, { userId: input.userId, visitorId: input.visitorId }, now);
    const [order] = await tx.query<OrderRow>(
      `insert into lastro.orders (id, user_id, plan_id, amount_minor, currency, status, provider, visitor_id, payment_method, purpose, idempotency_key, affiliate_id, affiliate_code)
       values ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12) returning *`,
      [
        randomUUID(),
        input.userId,
        plan.id,
        plan.amount_minor,
        plan.currency,
        input.provider.id,
        input.visitorId,
        method,
        plan.id === "vitalicio" && access.state === "monthly" ? "upgrade" : "new",
        key,
        attribution?.affiliate_id ?? null,
        attribution?.code ?? null,
      ],
    );
    await enqueue(tx, config, "checkout.started", {
      user: { external_user_id: input.userId },
      visitor_id: input.visitorId,
      order: { external_order_id: order.id, plan_id: plan.id, plan_name: plan.name, amount_minor: plan.amount_minor, currency: plan.currency, status: "pending" },
      affiliate: attribution ? { centralis_affiliate_id: attribution.centralis_affiliate_id, code: attribution.code } : null,
    });
    return { ok: true as const, order, plan, reused: false };
  });
}

/** Stores what the gateway returned for this order (no card data exists to store). */
export async function attachCheckout(db: Db, orderId: string, result: CheckoutResult) {
  await db.query(
    `update lastro.orders set provider_checkout_id = $2, provider_payment_id = $3, payment_instructions = $4::jsonb, expires_at = $5, updated_at = now() where id = $1`,
    [orderId, result.providerCheckoutId, result.providerPaymentId ?? null, JSON.stringify(result.instructions), result.expiresAt ?? null],
  );
}

/** "Pagar depois": remembered for navigation only. Creates no order and sends nothing. */
export async function deferCheckout(db: Db, userId: string) {
  await db.query(`update lastro.users set checkout_deferred_at = coalesce(checkout_deferred_at, now()) where id = $1`, [userId]);
}

export interface OrderStatus {
  id: string;
  planId: string;
  method: PaymentMethod | null;
  status: "pending" | "approved" | "failed" | "expired" | "cancelled" | "refunded";
  instructions: PaymentInstructions | null;
  expiresAt: string | null;
}

/**
 * The status of one of the user's own orders (another user's id is "not found"). While it is
 * pending, the gateway is asked server-side — an authenticated query is a valid confirmation,
 * applied through the same idempotent path as a webhook.
 */
export async function orderStatus(db: Db, config: CentralisConfig, userId: string, orderId: string, provider: PaymentProvider | null): Promise<OrderStatus | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  let [o] = await db.query<OrderRow>(`select * from lastro.orders where id = $1 and user_id = $2`, [orderId, userId]);
  if (!o) return null;
  if (o.status === "pending" && provider && provider.id === o.provider && provider.getPayment && o.provider_payment_id) {
    const ev = await provider.getPayment(o.provider_payment_id).catch(() => null);
    if (ev && ev.orderId === o.id && ev.type !== "payment.pending") {
      // The query answer is keyed by the transaction, so a later webhook for it is a no-op.
      const result: HandleResult = await handlePaymentEvent(db, config, o.provider, { ...ev, providerEventId: `query:${ev.type}:${ev.transactionId ?? o.id}` }).catch(() => "ignored" as const);
      void result;
      [o] = await db.query<OrderRow>(`select * from lastro.orders where id = $1 and user_id = $2`, [orderId, userId]);
    }
  }
  return {
    id: o.id,
    planId: o.plan_id,
    method: o.payment_method,
    status: o.status as OrderStatus["status"],
    instructions: o.status === "pending" ? o.payment_instructions : null,
    expiresAt: o.expires_at ? new Date(o.expires_at).toISOString() : null,
  };
}

/* --------------------------- renewal cancellation (upgrade) --------------------------- */

const CANCEL_MAX_ATTEMPTS = 12;
const cancelBackoffSeconds = (attempt: number) => Math.min(60 * 4 ** Math.max(0, attempt - 1), 6 * 3600);

/**
 * After an upgrade, stops the old monthly renewal at the gateway. Retried with backoff; the
 * subscription is only marked as "won't renew" once the gateway says so. After the last
 * attempt the review stays open for a person.
 */
export async function processRenewalCancellations(db: Db, provider: PaymentProvider | null, now = new Date(), limit = 20) {
  if (!provider?.cancelSubscription) return { done: 0, failed: 0 };
  const tasks = await db.query<{ id: string; subscription_id: string; attempts: number; provider_subscription_id: string; provider: string }>(
    `select r.id, r.subscription_id, r.attempts, s.provider_subscription_id, s.provider
       from lastro.payment_reviews r join lastro.subscriptions s on s.id = r.subscription_id
      where r.kind = 'cancel_renewal' and r.status = 'open' and r.next_attempt_at is not null and r.next_attempt_at <= $1
      order by r.next_attempt_at limit $2`,
    [now, limit],
  );
  let done = 0;
  let failed = 0;
  for (const t of tasks) {
    if (t.provider !== provider.id) continue;
    const r = await provider.cancelSubscription(t.provider_subscription_id).catch(() => ({ ok: false }));
    if (r.ok) {
      await db.tx(async (tx) => {
        await tx.query(`update lastro.subscriptions set cancel_at_period_end = true, updated_at = now() where id = $1`, [t.subscription_id]);
        await tx.query(`update lastro.payment_reviews set status = 'resolved', resolved_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [t.id]);
      });
      done++;
    } else {
      const attempts = t.attempts + 1;
      await db.query(`update lastro.payment_reviews set attempts = $2, last_error = 'gateway refused or unreachable', next_attempt_at = $3 where id = $1`, [
        t.id,
        attempts,
        attempts >= CANCEL_MAX_ATTEMPTS ? null : new Date(now.getTime() + cancelBackoffSeconds(attempts) * 1000),
      ]);
      failed++;
    }
  }
  return { done, failed };
}

/** Cancels the renewal of the user's own active subscription (profile → "Cancelar renovação"). */
export async function requestRenewalCancellation(db: Db, userId: string, provider: PaymentProvider | null): Promise<{ ok: true } | { ok: false; error: "no_subscription" | "not_supported" | "gateway_error" }> {
  const [sub] = await db.query<{ id: string; provider: string; provider_subscription_id: string }>(
    `select id, provider, provider_subscription_id from lastro.subscriptions where user_id = $1 and status in ('active', 'past_due') and not cancel_at_period_end order by created_at desc limit 1`,
    [userId],
  );
  if (!sub) return { ok: false, error: "no_subscription" };
  if (!provider?.cancelSubscription || provider.id !== sub.provider) return { ok: false, error: "not_supported" };
  const r = await provider.cancelSubscription(sub.provider_subscription_id).catch(() => ({ ok: false }));
  if (!r.ok) return { ok: false, error: "gateway_error" };
  await db.query(`update lastro.subscriptions set cancel_at_period_end = true, updated_at = now() where id = $1`, [sub.id]);
  return { ok: true };
}
