import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentEventType, PaymentProvider } from "./provider.ts";

/**
 * Development/test gateway. Webhooks are HMAC-signed with PAYMENT_SANDBOX_SECRET, exactly like
 * a real gateway's, so the whole flow (pending → approved → refund, duplicate deliveries,
 * renewals) can be exercised without a real payment account. Refused in production unless
 * explicitly allowed.
 */

const TYPES: PaymentEventType[] = ["payment.approved", "payment.pending", "payment.failed", "payment.refunded", "subscription.renewed", "subscription.cancelled"];

export const signSandboxWebhook = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

export function createSandboxProvider(secret: string): PaymentProvider {
  return {
    id: "sandbox",
    async createCheckout(req) {
      void req;
      return { providerCheckoutId: `sbx_${randomUUID()}`, url: null };
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
      if (typeof e.id !== "string" || !TYPES.includes(e.type as PaymentEventType)) return null;
      const ev: PaymentEvent = {
        providerEventId: e.id,
        type: e.type as PaymentEventType,
        orderId: typeof e.order_id === "string" ? e.order_id : undefined,
        transactionId: typeof e.transaction_id === "string" ? e.transaction_id : undefined,
        refundedTransactionId: typeof e.refunded_transaction_id === "string" ? e.refunded_transaction_id : undefined,
        providerSubscriptionId: typeof e.subscription_id === "string" ? e.subscription_id : undefined,
        amountMinor: Number.isInteger(e.amount_minor) ? (e.amount_minor as number) : undefined,
        currency: typeof e.currency === "string" ? e.currency : undefined,
        occurredAt: typeof e.occurred_at === "string" ? new Date(e.occurred_at) : new Date(),
      };
      return [ev];
    },
  };
}
