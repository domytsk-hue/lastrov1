import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentEventType, PaymentProvider } from "./provider.ts";

/**
 * Mercado Pago adapter — card and Pix on Lastro's own checkout ("Checkout Transparente").
 *
 *   card:  MercadoPago.js secure fields (iframes) → card token          (card data never reaches Lastro)
 *          POST {api}/v1/payments { token, amount from the catalog, external_reference: order id }
 *   Pix:   POST {api}/v1/payments { payment_method_id: "pix", amount, payer, expiry } → QR + copy-and-paste
 *   webhook: x-signature (HMAC-SHA256) checked → GET {api}/v1/payments/:id  (status and amount from there)
 *
 * The access token stays on the server. The public key goes to the browser — it can only make
 * card tokens, not charges. A webhook is checked twice: its signature, and then Lastro asks
 * Mercado Pago itself what the payment is; nothing in the webhook body is trusted.
 */

export interface MercadoPagoConfig {
  apiUrl: string;
  accessToken: string;
  publicKey: string;
  /** "Assinatura secreta" of the webhook (Suas integrações → Webhooks). */
  webhookSecret: string;
  /** Name on the buyer's card statement (up to 13 characters). */
  statementDescriptor: string;
}

/** Mercado Pago is configured only with the access token, the public key and the webhook secret. */
export function mercadoPagoConfig(env: NodeJS.ProcessEnv = process.env): MercadoPagoConfig | null {
  const accessToken = env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
  const publicKey = env.MERCADOPAGO_PUBLIC_KEY?.trim() ?? "";
  const webhookSecret = env.MERCADOPAGO_WEBHOOK_SECRET?.trim() ?? "";
  if (!accessToken || !publicKey || webhookSecret.length < 16) return null;
  const apiUrl = (env.MERCADOPAGO_API_URL || "https://api.mercadopago.com").replace(/\/+$/, "");
  if (!apiUrl.startsWith("https://")) return null;
  const statementDescriptor = (env.MERCADOPAGO_STATEMENT_DESCRIPTOR?.trim() || "LASTRO").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 13) || "LASTRO";
  return { apiUrl, accessToken, publicKey, webhookSecret, statementDescriptor };
}

/* ------------------------------------ parsing ------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 99.9 (reais, as Mercado Pago writes amounts) → 9990 centavos. */
export const toMinor = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : undefined);

const date = (v: unknown) => {
  const s = str(v);
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};

/** Mercado Pago payment status → Lastro event. Anything else goes to a person. */
const STATUS: Record<string, PaymentEventType> = {
  approved: "payment.approved",
  pending: "payment.pending",
  in_process: "payment.pending",
  authorized: "payment.pending", // authorized but not captured: not money yet
  rejected: "payment.failed",
  cancelled: "payment.failed",
  refunded: "payment.refunded",
  charged_back: "payment.refunded",
};

/** How long a Pix code is valid (Mercado Pago accepts 30 minutes to 30 days). */
export const PIX_MINUTES = 31;

/** "+5511987654321" → { area_code: "11", number: "987654321" } (Mercado Pago's payer phone). */
const phoneOf = (e164: string | null | undefined) => {
  const d = (e164 ?? "").replace(/\D/g, "").replace(/^55/, "");
  return d.length >= 10 ? { area_code: d.slice(0, 2), number: d.slice(2) } : undefined;
};

/** A Date as Mercado Pago wants it: ISO with the Brasília offset, e.g. 2026-10-09T15:30:00.000-03:00. */
const brtIso = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().replace("Z", "-03:00");

/** A payment as Mercado Pago reports it (GET /v1/payments/:id) → a PaymentEvent. */
export function paymentEvent(p: Obj): PaymentEvent {
  const id = str(p.id) as string;
  const status = str(p.status)?.toLowerCase() ?? "";
  // A Pix that ran out of time comes back as cancelled / expired: nothing was charged.
  const type = status === "cancelled" && str(p.status_detail)?.toLowerCase() === "expired" ? "payment.expired" : (STATUS[status] ?? "unhandled");
  const ref = str(p.external_reference);
  const kind = str(p.payment_type_id);
  return {
    providerEventId: `mp:${id}:${status || "unknown"}`,
    type,
    orderId: ref && UUID.test(ref) ? ref.toLowerCase() : undefined,
    transactionId: id,
    refundedTransactionId: type === "payment.refunded" ? id : undefined,
    refundReason: status === "charged_back" ? "chargeback" : type === "payment.refunded" ? "refund" : undefined,
    amountMinor: toMinor(p.transaction_amount),
    currency: str(p.currency_id)?.toUpperCase(),
    method: kind === "credit_card" || kind === "debit_card" || kind === "prepaid_card" ? "card" : kind === "bank_transfer" ? "pix" : undefined,
    gatewayEventName: type === "unhandled" ? `status ${status || "?"}` : undefined,
    occurredAt: date(p.date_approved) ?? date(p.date_last_updated) ?? date(p.date_created) ?? new Date(),
  };
}

/**
 * Mercado Pago's webhook signature: x-signature "ts=<ts>,v1=<hex>", HMAC-SHA256 with the
 * webhook secret over "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (data.id from the URL,
 * lowercased; a missing part is left out).
 */
export function verifySignature(secret: string, headers: Headers, dataId: string | null): boolean {
  const parts = Object.fromEntries(
    (headers.get("x-signature") ?? "").split(",").map((kv) => {
      const [k, ...v] = kv.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const requestId = headers.get("x-request-id");
  const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

/** The single-use card token and the brand Mercado Pago's script reported, as Lastro accepts them. */
export function parseCardInput(v: unknown): CheckoutRequest["card"] {
  const c = obj(v);
  const token = str(c.token);
  const paymentMethodId = str(c.payment_method_id);
  const issuerId = str(c.issuer_id) ?? null;
  // Mercado Pago's device fingerprint (security.js): a strong signal for its anti-fraud review.
  const device = str(c.device_id);
  if (!token || !/^[A-Za-z0-9]{16,64}$/.test(token)) return null;
  if (!paymentMethodId || !/^[a-z_]{2,30}$/.test(paymentMethodId)) return null;
  if (issuerId !== null && !/^\d{1,12}$/.test(issuerId)) return null;
  return { token, paymentMethodId, issuerId, deviceId: device && /^[A-Za-z0-9_.:-]{8,200}$/.test(device) ? device : null };
}

/**
 * Why Mercado Pago refused a request, for the server log: its error code, message and causes
 * (e.g. "2006 Card Token not found"). Never the request, the token or any card data.
 */
export function gatewayReason(body: Obj): string {
  const causes = Array.isArray(body.cause) ? body.cause.map((c) => `${str(obj(c).code) ?? ""} ${str(obj(c).description) ?? ""}`.trim()).filter(Boolean) : [];
  return [str(body.error), str(body.message), ...causes].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 300);
}

/* ------------------------------------ adapter ------------------------------------ */

export function createMercadoPagoProvider(config: MercadoPagoConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchImpl(`${config.apiUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body: obj(body) };
  };

  /** The payment as Mercado Pago sees it now; null when it doesn't exist (for this account). */
  const getPayment = async (id: string): Promise<PaymentEvent | null> => {
    if (!/^\d{1,20}$/.test(id)) return null;
    const r = await call(`/v1/payments/${id}`);
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`mercadopago: payment query answered ${r.status}`);
    if (str(r.body.id) !== id) return null; // the answer must be about the payment we asked for
    return paymentEvent(r.body);
  };

  /** A Pix charge: Mercado Pago returns the copy-and-paste code; Lastro draws the QR from it. */
  const createPix = async (req: CheckoutRequest): Promise<CheckoutResult> => {
    const c = req.customer;
    if (!c?.email) throw new Error("mercadopago: payer e-mail required for Pix");
    const [firstName, ...rest] = (c.name ?? "").split(" ");
    const expires = new Date(Date.now() + PIX_MINUTES * 60_000);
    const payload = {
      transaction_amount: req.plan.amountMinor / 100, // from the catalog, never from the browser
      payment_method_id: "pix",
      description: `Lastro — plano ${req.plan.name}`,
      external_reference: req.orderId,
      date_of_expiration: brtIso(expires),
      payer: {
        email: c.email,
        first_name: firstName || undefined,
        last_name: rest.join(" ") || undefined,
        identification: c.document ? { type: "CPF", number: c.document } : undefined,
      },
      additional_info: {
        items: [{ id: req.plan.id, title: `Lastro — ${req.plan.name}`, description: "Assinatura do aplicativo Lastro", category_id: "services", quantity: 1, unit_price: req.plan.amountMinor / 100 }],
        payer: { first_name: firstName || undefined, last_name: rest.join(" ") || undefined, phone: phoneOf(c.phone) },
      },
    };
    // One Pix per order: a retry after a timeout returns the same charge.
    const idempotencyKey = createHash("sha256").update(`${req.orderId}:pix`).digest("hex").slice(0, 64);
    const r = await call("/v1/payments", { method: "POST", body: JSON.stringify(payload), headers: { "X-Idempotency-Key": idempotencyKey } });
    if (r.status !== 200 && r.status !== 201) throw new Error(`mercadopago: create Pix answered ${r.status} ${gatewayReason(r.body)}`);
    const id = str(r.body.id);
    const tx = obj(obj(r.body.point_of_interaction).transaction_data);
    const copyPaste = str(tx.qr_code);
    if (!id || !copyPaste) throw new Error("mercadopago: Pix without id or code");
    if (toMinor(r.body.transaction_amount) !== undefined && toMinor(r.body.transaction_amount) !== req.plan.amountMinor) throw new Error("mercadopago: Pix with another amount");
    const until = date(r.body.date_of_expiration) ?? expires;
    const svg = await QRCode.toString(copyPaste, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return {
      providerCheckoutId: id,
      providerPaymentId: id,
      expiresAt: until,
      instructions: { kind: "pix", copyPaste, qrCodeImage: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, expiresAt: until.toISOString() },
    };
  };

  return {
    id: "mercadopago",
    methods: ["pix", "card"],
    supportsSubscriptions: false,
    billingFields: ["name", "email", "cpf"],
    publicKey: config.publicKey,
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      if (req.method === "pix") return createPix(req);
      if (req.method !== "card" || !req.card) throw new Error("mercadopago: card token required");
      const c = req.customer;
      const [firstName, ...rest] = (c?.name ?? "").split(" ");
      const payload = {
        transaction_amount: req.plan.amountMinor / 100, // from the catalog, never from the browser
        token: req.card.token,
        payment_method_id: req.card.paymentMethodId,
        ...(req.card.issuerId ? { issuer_id: Number(req.card.issuerId) } : {}),
        installments: 1,
        description: `Lastro — plano ${req.plan.name}`,
        statement_descriptor: config.statementDescriptor,
        external_reference: req.orderId,
        payer: {
          email: c?.email ?? undefined,
          first_name: firstName || undefined,
          last_name: rest.join(" ") || undefined,
          identification: c?.document ? { type: "CPF", number: c.document } : undefined,
        },
        additional_info: {
          items: [{ id: req.plan.id, title: `Lastro — ${req.plan.name}`, description: "Assinatura do aplicativo Lastro", category_id: "services", quantity: 1, unit_price: req.plan.amountMinor / 100 }],
          // More about the buyer = better odds with Mercado Pago's anti-fraud review.
          payer: { first_name: firstName || undefined, last_name: rest.join(" ") || undefined, phone: phoneOf(c?.phone) },
        },
      };
      // One key per order AND card token: a retry of the same attempt can't charge twice, and a
      // new card (new token) after a refusal is a new attempt.
      const idempotencyKey = createHash("sha256").update(`${req.orderId}:${req.card.token}`).digest("hex").slice(0, 64);
      const r = await call("/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "X-Idempotency-Key": idempotencyKey, ...(req.card.deviceId ? { "X-meli-session-id": req.card.deviceId } : {}) },
      });
      if (r.status !== 200 && r.status !== 201) throw new Error(`mercadopago: create payment answered ${r.status} ${gatewayReason(r.body)}`);
      const id = str(r.body.id);
      if (!id) throw new Error("mercadopago: payment without id");
      if (str(r.body.status) === "rejected") {
        // For the server log: why (e.g. cc_rejected_high_risk = anti-fraud). No card data.
        console.warn(JSON.stringify({ scope: "payments", level: "warn", message: "card refused", provider: "mercadopago", order_id: req.orderId, status_detail: str(r.body.status_detail) ?? null, device_id_sent: !!req.card.deviceId }));
      }
      // Approved, refused or in analysis: the page asks the server, which asks Mercado Pago.
      return { providerCheckoutId: id, providerPaymentId: id, instructions: { kind: "awaiting" } };
    },
    async parseWebhook(rawBody, headers, url) {
      let body: Obj = {};
      try {
        body = obj(JSON.parse(rawBody));
      } catch {
        body = {};
      }
      const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? str(obj(body.data).id) ?? null;
      if (!verifySignature(config.webhookSecret, headers, url.searchParams.get("data.id") ?? dataId)) return null;
      const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? str(body.type);
      // Authentic, but not about a payment (e.g. merchant_order): nothing to do.
      if (type !== "payment" || !dataId) return [];
      // The truth comes from Mercado Pago's API (an outage throws: the webhook is delivered again).
      const ev = await getPayment(dataId);
      return ev ? [ev] : [];
    },
    getPayment,
  };
}
