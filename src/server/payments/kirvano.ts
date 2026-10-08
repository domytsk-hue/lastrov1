import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentMethod, PaymentProvider } from "./provider.ts";

/**
 * Kirvano adapter. Kirvano is a HOSTED checkout: each plan is an offer with its own payment
 * page, where the buyer types name, e-mail, CPF and phone and pays with Pix or card. Lastro
 * sends nothing personal — only our order id, as the tracking parameter `src` that Kirvano
 * echoes back in every webhook (`utm.src`).
 *
 *   /checkout → order (pending) → redirect to the offer page ?src=lastro-<order id>
 *   Kirvano webhook (token checked) → SALE_APPROVED → amount, plan and order checked → access
 *
 * Kirvano has no public API to create or query a charge, so confirmation comes ONLY from its
 * webhook, authenticated by the token configured in Kirvano (header) or in the webhook URL.
 *
 * Event names come from Kirvano's published examples: SALE_APPROVED (type ONE_TIME or
 * RECURRING), SALE_REFUSED, SALE_CHARGEBACK, PIX_GENERATED, PIX_EXPIRED, BANK_SLIP_GENERATED,
 * BANK_SLIP_EXPIRED, ABANDONED_CART. Refunds and subscription changes are not in those
 * examples, so `status` is read too (a renamed event can't slip through); anything else
 * authentic becomes an "unhandled" event that a person reviews — never a guess.
 */

export interface KirvanoConfig {
  /** Secret also configured in the Kirvano webhook (Token field and/or ?token= in its URL). */
  webhookToken: string;
  /** Offer payment pages, e.g. https://pay.kirvano.com/<id>. */
  checkoutUrl: { mensal: string; vitalicio: string };
  /** Offer ids (products[].offer_id in the webhook). When set, a sale must be of the right offer. */
  offerId: { mensal: string | null; vitalicio: string | null };
  /** The Mensal offer is a Kirvano subscription (renewed automatically by Kirvano). */
  monthlyRecurring: boolean;
}

const https = (v: string | undefined) => {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Kirvano is configured only when every required value is present and well-formed. */
export function kirvanoConfig(env: NodeJS.ProcessEnv = process.env): KirvanoConfig | null {
  const token = env.KIRVANO_WEBHOOK_TOKEN ?? "";
  const mensal = https(env.KIRVANO_CHECKOUT_URL_MENSAL);
  const vitalicio = https(env.KIRVANO_CHECKOUT_URL_VITALICIO);
  if (token.length < 16 || !mensal || !vitalicio) return null;
  return {
    webhookToken: token,
    checkoutUrl: { mensal, vitalicio },
    offerId: { mensal: env.KIRVANO_OFFER_ID_MENSAL?.trim() || null, vitalicio: env.KIRVANO_OFFER_ID_VITALICIO?.trim() || null },
    monthlyRecurring: env.KIRVANO_MENSAL_RECORRENTE === "true",
  };
}

/* ------------------------------------ parsing ------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** "R$ 1.234,56" / "99,90" / 99.9 → minor units. Anything else → undefined (no access). */
export function parseBrlToMinor(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v * 100);
  if (typeof v !== "string") return undefined;
  const m = v.replace(/\s|R\$/g, "").match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return undefined;
  const reais = Number(m[1].replace(/\./g, ""));
  const cents = Number((m[2] ?? "0").padEnd(2, "0"));
  return reais * 100 + cents;
}

/** Kirvano dates are "YYYY-MM-DD HH:mm:ss" without a zone: Brasília time (UTC−3). */
export function parseKirvanoDate(v: unknown): Date | undefined {
  const s = str(v);
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const ORDER_REF = /^lastro-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const orderRef = (orderId: string) => `lastro-${orderId}`;

const METHOD: Record<string, PaymentMethod> = { PIX: "pix", CREDIT_CARD: "card" };

/** Event names, by meaning. `status` is checked too, so a renamed event still lands right. */
/** A paid sale or a paid subscription cycle (SUBSCRIPTION_RENEWED, status APPROVED). */
const APPROVED = new Set(["SALE_APPROVED", "SUBSCRIPTION_RENEWED"]);
const PENDING = new Set(["PIX_GENERATED", "BANK_SLIP_GENERATED", "ABANDONED_CART", "SALE_CREATED"]);
const EXPIRED = new Set(["PIX_EXPIRED", "BANK_SLIP_EXPIRED"]);
const REFUSED = new Set(["SALE_REFUSED"]);
const REFUNDED = new Set(["SALE_REFUNDED", "REFUND", "REFUNDED"]);
const CHARGEBACK = new Set(["SALE_CHARGEBACK", "CHARGEBACK"]);
/** Kirvano subscription lifecycle: the paid month already ended or continues on its own. */
const SUBSCRIPTION_INFO = new Set(["SUBSCRIPTION_CANCELED", "SUBSCRIPTION_CANCELLED", "SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_OVERDUE", "SUBSCRIPTION_LATE"]);

function planFromOffers(config: KirvanoConfig, products: unknown): string | undefined {
  const offers = (Array.isArray(products) ? products : []).map((p) => str(obj(p).offer_id)).filter(Boolean) as string[];
  if (config.offerId.vitalicio && offers.includes(config.offerId.vitalicio)) return "vitalicio";
  if (config.offerId.mensal && offers.includes(config.offerId.mensal)) return "mensal";
  // Offer ids configured but none matched: a sale of something else — never one of our plans.
  if (config.offerId.vitalicio || config.offerId.mensal) return "unknown";
  return undefined;
}

/** One Kirvano webhook body → one PaymentEvent (or null when it isn't a Kirvano sale event). */
export function kirvanoEvent(config: KirvanoConfig, body: Obj): PaymentEvent | null {
  const name = str(body.event)?.toUpperCase();
  const status = str(body.status)?.toUpperCase();
  const saleId = str(body.sale_id) ?? str(body.checkout_id);
  if (!name || !saleId) return null;
  const payment = obj(body.payment);
  const ref = str(obj(body.utm).src)?.match(ORDER_REF)?.[1];
  // Subscriptions come as type "RECURRING" with plan { charge_frequency, next_charge_date }:
  // the paid month runs until Kirvano's next charge. Only a MONTHLY frequency is our Mensal.
  const recurring = str(body.type)?.toUpperCase() === "RECURRING";
  const subPlan = obj(body.plan);
  const frequency = str(subPlan.charge_frequency)?.toUpperCase();
  const occurredAt = parseKirvanoDate(payment.finished_at) ?? parseKirvanoDate(body.created_at) ?? new Date();
  const nextCharge = recurring ? parseKirvanoDate(subPlan.next_charge_date) : undefined;
  let planId = planFromOffers(config, body.products);
  if (recurring && frequency && frequency !== "MONTHLY") planId = "unknown";
  // A subscription renewal can carry the ORIGINAL sale_id (Kirvano's examples do): each billing
  // cycle is its own payment, keyed by the sale and the cycle's next charge date.
  const sale = str(body.sale_id);
  const cycle = name === "SUBSCRIPTION_RENEWED" ? (str(subPlan.next_charge_date) ?? str(payment.finished_at) ?? str(body.created_at)) : undefined;
  const transactionId = sale && cycle ? `${sale}:${cycle}` : sale;
  const base = {
    // Kirvano sends no event id; one payment goes through each event at most once.
    providerEventId: `${name}:${transactionId ?? saleId}`,
    orderId: ref,
    transactionId,
    amountMinor: parseBrlToMinor(body.total_price),
    currency: "BRL",
    planId,
    method: METHOD[str(body.payment_method)?.toUpperCase() ?? str(payment.method)?.toUpperCase() ?? ""],
    customerEmail: str(obj(body.customer).email)?.toLowerCase(),
    gatewayRenewsMonthly: config.monthlyRecurring,
    periodStart: nextCharge && nextCharge > occurredAt ? occurredAt : undefined,
    periodEnd: nextCharge && nextCharge > occurredAt ? nextCharge : undefined,
    occurredAt,
  } satisfies Omit<PaymentEvent, "type">;

  if (APPROVED.has(name)) return status === "APPROVED" ? { ...base, type: "payment.approved" } : { ...base, type: "unhandled", gatewayEventName: `${name}/${status ?? "?"}` };
  if (CHARGEBACK.has(name) || status === "CHARGEBACK") return { ...base, type: "payment.refunded", refundedTransactionId: sale, refundReason: "chargeback" };
  if (REFUNDED.has(name) || status === "REFUNDED") return { ...base, type: "payment.refunded", refundedTransactionId: sale, refundReason: "refund" };
  if (REFUSED.has(name) || status === "REFUSED") return { ...base, type: "payment.failed" };
  if (EXPIRED.has(name)) return { ...base, type: "payment.expired" };
  if (PENDING.has(name)) return { ...base, type: "payment.pending" };
  if (SUBSCRIPTION_INFO.has(name)) return { ...base, type: "payment.pending" }; // informational: access follows the paid months
  return { ...base, type: "unhandled", gatewayEventName: name };
}

/** Constant-time comparison of a presented token with the configured one. */
function tokenMatches(presented: string | null | undefined, expected: string) {
  if (!presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/* ------------------------------------ adapter ------------------------------------ */

export function createKirvanoProvider(config: KirvanoConfig): PaymentProvider {
  return {
    id: "kirvano",
    methods: ["pix", "card"],
    // Lastro can't cancel a Kirvano subscription by API; Kirvano manages it.
    supportsSubscriptions: false,
    hostedCheckout: true,
    autoRenews: config.monthlyRecurring,
    async createCheckout(req) {
      const page = new URL(req.plan.id === "mensal" ? config.checkoutUrl.mensal : config.checkoutUrl.vitalicio);
      // Our order reference travels as Kirvano's tracking parameter and comes back as utm.src.
      page.searchParams.set("src", orderRef(req.orderId));
      return { providerCheckoutId: orderRef(req.orderId), instructions: { kind: "redirect", url: page.toString() } };
    },
    async parseWebhook(rawBody, headers, url) {
      // The token Kirvano sends (header) or the one in the webhook URL we gave it.
      const presented = headers.get("x-kirvano-token") ?? headers.get("security-token") ?? headers.get("x-webhook-token") ?? url.searchParams.get("token");
      if (!tokenMatches(presented, config.webhookToken)) return null;
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const ev = kirvanoEvent(config, obj(body));
      return ev ? [ev] : null;
    },
  };
}
