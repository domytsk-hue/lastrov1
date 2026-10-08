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

/** Billing fields Lastro's own checkout collects for a gateway. */
export type BillingField = "name" | "email" | "cpf" | "phone";
export const ALL_BILLING_FIELDS: BillingField[] = ["name", "email", "cpf", "phone"];

export type PaymentEventType =
  | "payment.approved"     // money confirmed for the order's first charge
  | "payment.pending"      // e.g. Pix issued, card in analysis — NOT a purchase
  | "payment.failed"       // declined / failed
  | "payment.expired"      // a Pix that was never paid
  | "payment.refunded"     // refund or chargeback of a confirmed charge
  | "subscription.renewed" // a recurring charge was paid
  | "subscription.cancelled"
  | "unhandled";           // an authentic event Lastro doesn't know: kept for a person, never guessed

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
  /** The plan the gateway says was sold (e.g. from its offer id) — must match the order's. */
  planId?: string;
  /** How it was paid, when the gateway's own page chose it. */
  method?: PaymentMethod;
  /**
   * The buyer's e-mail as typed on the gateway's page. Used ONLY in memory to find the order
   * when the gateway lost our reference; never stored, never sent anywhere.
   */
  customerEmail?: string;
  /**
   * The gateway renews monthly plans by itself and Lastro can't stop that by API (Kirvano):
   * after an upgrade, a person must cancel the old monthly subscription at the gateway.
   */
  gatewayRenewsMonthly?: boolean;
  /** For "unhandled": the gateway's own event name (no payload, no personal data). */
  gatewayEventName?: string;
  occurredAt: Date;
}

export interface CheckoutRequest {
  orderId: string;
  plan: { id: string; name: string; amountMinor: number; currency: string; billing: "one_time" | "monthly" };
  /** null when the gateway's own page lets the buyer choose. */
  method: PaymentMethod | null;
  /**
   * Billing data typed on Lastro's checkout. It goes to the gateway only; Lastro does not store
   * the CPF. Fields the gateway's own page collects are null; no fields at all → null.
   */
  customer: { userId: string; name: string | null; email: string | null; phone: string | null; document: string | null } | null;
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
  /** What may be saved for showing again later, when `instructions` carries personal data (e.g. a pre-filled link). */
  storable?: PaymentInstructions;
  expiresAt?: Date;
}

export interface PaymentProvider {
  id: string;
  methods: PaymentMethod[];
  /** True only when Lastro can manage recurring subscriptions through the gateway (cancel renewal). */
  supportsSubscriptions: boolean;
  /**
   * The gateway's own page collects the billing data (name, e-mail, CPF, phone) and the
   * method (Pix or card). Lastro then asks for none of it: plan → redirect.
   */
  hostedCheckout?: boolean;
  /**
   * Fields Lastro's checkout collects and hands to the gateway (a hosted page can be pre-filled
   * with them). Default: all four, or none with a hosted checkout.
   */
  billingFields?: BillingField[];
  /** The monthly plan is renewed automatically by the gateway (Lastro learns of each renewal by webhook). */
  autoRenews?: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies the webhook's authenticity; returns null when it is not authentic. */
  parseWebhook(rawBody: string, headers: Headers, url: URL): Promise<PaymentEvent[] | null>;
  /** Authenticated server-side status query (the page's "check again"). */
  getPayment?(providerPaymentId: string): Promise<PaymentEvent | null>;
  /** Stops future renewals; the paid period is kept. */
  cancelSubscription?(providerSubscriptionId: string): Promise<{ ok: boolean }>;
}
