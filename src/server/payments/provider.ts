/**
 * Gateway-agnostic payment contracts. A gateway (Stripe, Mercado Pago, Asaas, Pagar.me…)
 * is an adapter: it opens checkouts and turns its signed webhooks into PaymentEvents.
 * Nothing else in Lastro knows which gateway is in use.
 */

export type PaymentEventType =
  | "payment.approved"     // money confirmed for the order's first charge
  | "payment.pending"      // e.g. boleto/pix issued — NOT a purchase
  | "payment.failed"
  | "payment.refunded"
  | "subscription.renewed" // a recurring charge was paid
  | "subscription.cancelled";

export interface PaymentEvent {
  /** The gateway's own event id — deduplicates webhook retries. */
  providerEventId: string;
  type: PaymentEventType;
  /** Our order id, echoed back by the gateway (metadata / external_reference). */
  orderId?: string;
  /** The gateway's transaction/charge id — one confirmed charge per id, ever. */
  transactionId?: string;
  /** For refunds: the transaction being refunded. */
  refundedTransactionId?: string;
  providerSubscriptionId?: string;
  /** What the gateway actually confirmed, in minor units. */
  amountMinor?: number;
  currency?: string;
  occurredAt: Date;
}

export interface CheckoutRequest {
  orderId: string;
  plan: { id: string; name: string; amountMinor: number; currency: string; billing: "one_time" | "monthly" };
  customer: { userId: string; name: string; email: string | null; phone: string | null };
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  id: string;
  createCheckout(req: CheckoutRequest): Promise<{ providerCheckoutId: string; url: string | null }>;
  /** Verifies the webhook signature; returns null when it is not authentic. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent[] | null>;
}
