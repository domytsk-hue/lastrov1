import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentEventType, PaymentProvider } from "./provider.ts";

/**
 * Development/test gateway. Webhooks are HMAC-signed with PAYMENT_SANDBOX_SECRET, exactly like
 * a real gateway's, so the whole flow (pending → approved → refund, duplicate deliveries,
 * renewals, upgrades) can be exercised without a real payment account.
 *
 * It never exists in production (see registry.ts) and nothing it returns can be paid: the
 * "Pix code" is a label, not a BR Code, and there is no QR image.
 */

const TYPES: PaymentEventType[] = ["payment.approved", "payment.pending", "payment.failed", "payment.expired", "payment.refunded", "subscription.renewed", "subscription.cancelled"];

export const signSandboxWebhook = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);

/** Parses one sandbox event object (webhook body or status answer). */
export function sandboxEvent(e: Record<string, unknown>): PaymentEvent | null {
  if (typeof e.id !== "string" || !TYPES.includes(e.type as PaymentEventType)) return null;
  return {
    providerEventId: e.id,
    type: e.type as PaymentEventType,
    orderId: typeof e.order_id === "string" ? e.order_id : undefined,
    transactionId: typeof e.transaction_id === "string" ? e.transaction_id : undefined,
    refundedTransactionId: typeof e.refunded_transaction_id === "string" ? e.refunded_transaction_id : undefined,
    providerSubscriptionId: typeof e.subscription_id === "string" ? e.subscription_id : undefined,
    amountMinor: Number.isInteger(e.amount_minor) ? (e.amount_minor as number) : undefined,
    currency: typeof e.currency === "string" ? e.currency : undefined,
    periodStart: date(e.period_start),
    periodEnd: date(e.period_end),
    refundReason: e.refund_reason === "chargeback" ? "chargeback" : e.refund_reason === "refund" ? "refund" : undefined,
    occurredAt: date(e.occurred_at) ?? new Date(),
  };
}

export interface SandboxState {
  /** What a status query answers, per provider payment id (tests fill it). */
  payments: Map<string, Record<string, unknown>>;
  /** Subscription ids whose renewal was cancelled. */
  cancelled: Set<string>;
  /** When true, cancelSubscription fails (to exercise the retry path). */
  failCancellation: boolean;
}

export function createSandboxProvider(secret: string, state: SandboxState = { payments: new Map(), cancelled: new Set(), failCancellation: false }): PaymentProvider & { state: SandboxState } {
  return {
    id: "sandbox",
    methods: ["pix", "card"],
    supportsSubscriptions: true,
    state,
    async createCheckout(req) {
      const paymentId = `sbx_pay_${req.orderId}`;
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      return {
        providerCheckoutId: `sbx_${randomUUID()}`,
        providerPaymentId: paymentId,
        expiresAt: req.method !== "card" ? expiresAt : undefined,
        instructions:
          req.method !== "card"
            ? { kind: "pix", copyPaste: `SANDBOX-NAO-PAGAVEL-${req.orderId}`, qrCodeImage: null, expiresAt: expiresAt.toISOString() }
            : { kind: "awaiting" },
      };
    },
    async parseWebhook(rawBody, headers) {
      const given = headers.get("x-sandbox-signature") ?? "";
      const expected = signSandboxWebhook(secret, rawBody);
      if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
      let e: Record<string, unknown>;
      try {
        e = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const ev = sandboxEvent(e);
      return ev ? [ev] : null;
    },
    async getPayment(providerPaymentId) {
      const e = state.payments.get(providerPaymentId);
      return e ? sandboxEvent(e) : null;
    },
    async cancelSubscription(providerSubscriptionId) {
      if (state.failCancellation) return { ok: false };
      state.cancelled.add(providerSubscriptionId);
      return { ok: true };
    },
  };
}
