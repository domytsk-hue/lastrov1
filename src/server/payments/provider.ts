/**
 * Gateway-agnostic payment contracts. A gateway (Mercado Pago, Asaas, Pagar.me, Stripe…) is
 * an adapter: it opens a charge for an order, turns its authenticated webhooks into
 * PaymentEvents and, when it can, answers an authenticated status query. Nothing else in
 * Lastro knows which gateway is in use — plans, orders and access stay Lastro's.
 *
 * Adapter obligations (checked by Lastro where it can, but the adapter is the first line):
 *  - parseWebhook verifies the gateway's signature/authentication and returns null otherwise;
 *  - events from another account or environment (test vs live) are rejected, not returned;
 *  - "payment.approved" means money captured — an authorization still to be captured is NOT;
 *  - createCheckout uses `orderId` as the gateway's idempotency key / external reference, so
 *    a retry after a timeout returns the same charge instead of opening a second one;
 *  - card data never passes through Lastro: hosted page, iframe or the gateway's SDK only.
 */

export type PaymentMethod = "pix" | "card";

export type PaymentEventType =
  | "payment.approved"     // money confirmed for the order's first charge
  | "payment.pending"      // e.g. Pix issued, card in analysis — NOT a purchase
  | "payment.failed"       // declined / failed
  | "payment.expired"      // a Pix that was never paid
  | "payment.refunded"     // refund or chargeback of a confirmed charge
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
  /** What the gateway actually confirmed, in minor units. Required to release access. */
  amountMinor?: number;
  currency?: string;
  /** Paid period, when the gateway states it (recurring charges). */
  periodStart?: Date;
  periodEnd?: Date;
  /** "refund" or "chargeback", for payment.refunded. */
  refundReason?: "refund" | "chargeback";
  occurredAt: Date;
}

export interface CheckoutRequest {
  orderId: string;
  plan: { id: string; name: string; amountMinor: number; currency: string; billing: "one_time" | "monthly" };
  method: PaymentMethod;
  /** Billing data goes to the gateway only; Lastro does not store the CPF. */
  customer: { userId: string; name: string; email: string; phone: string; document: string };
  /** Where the gateway sends the buyer back. The page only ASKS the server for the status. */
  returnUrl: string;
}

/** What the buyer needs to pay — no secrets, no card data. */
export type PaymentInstructions =
  | { kind: "pix"; copyPaste: string; qrCodeImage: string | null; expiresAt: string | null }
  | { kind: "redirect"; url: string }
  /** The gateway confirms on its own (e.g. card in analysis); the page waits. */
  | { kind: "awaiting" };

export interface CheckoutResult {
  providerCheckoutId: string;
  providerPaymentId?: string;
  instructions: PaymentInstructions;
  expiresAt?: Date;
}

export interface PaymentProvider {
  id: string;
  methods: PaymentMethod[];
  /** True only when the gateway really charges recurring subscriptions. */
  supportsSubscriptions: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies the webhook's authenticity; returns null when it is not authentic. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent[] | null>;
  /** Authenticated server-side status query (the page's "check again"). */
  getPayment?(providerPaymentId: string): Promise<PaymentEvent | null>;
  /** Stops future renewals; the paid period is kept. */
  cancelSubscription?(providerSubscriptionId: string): Promise<{ ok: boolean }>;
}
