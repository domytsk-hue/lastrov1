import { timingSafeEqual, createHash } from "node:crypto";
import QRCode from "qrcode";
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentEventType, PaymentProvider } from "./provider.ts";

/**
 * Disrupty adapter — a transparent checkout: the buyer pays on Lastro's own page.
 *
 *   POST {api}/api/sales   { offerId, amount, paymentMethod: "PIX", customer }  → { id, status, payment.pix.key }
 *   GET  {api}/api/sales/:id                                                     → the sale as Disrupty sees it now
 *   webhook (transaction.paid / transaction.failed…)                             → Lastro re-reads GET /api/sales/:id
 *
 * Authentication: X-Api-Public-Key + X-Api-Private-Key on every call, server-side only (the
 * private key never reaches a browser).
 *
 * A webhook is never trusted for what it SAYS: Lastro only takes the sale id from it and asks
 * Disrupty itself (authenticated GET) what happened — status and amount come from that answer.
 * A forged webhook can at most make Lastro double-check a real sale. Optionally the webhook
 * URL also carries ?token=… (DISRUPTY_WEBHOOK_TOKEN) to turn away noise early.
 *
 * Not in the public part of Disrupty's documentation (to confirm on the first real sale):
 * the full sale schema (CPF, phone, expiry), every status name, the webhook body format and its
 * signature header, refunds. Unknown statuses become "unhandled" events for a person — never a
 * guessed approval.
 */

export interface DisruptyConfig {
  apiUrl: string;
  publicKey: string;
  privateKey: string;
  /** Disrupty offer (product) ids, one per plan. */
  offerId: { mensal: number; vitalicio: number };
  /** Optional shared token required as ?token= on the webhook URL. */
  webhookToken: string | null;
}

const int = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

/** Disrupty is configured only when keys and both offer ids are present. */
export function disruptyConfig(env: NodeJS.ProcessEnv = process.env): DisruptyConfig | null {
  const publicKey = env.DISRUPTY_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.DISRUPTY_PRIVATE_KEY?.trim() ?? "";
  const mensal = int(env.DISRUPTY_OFFER_ID_MENSAL);
  const vitalicio = int(env.DISRUPTY_OFFER_ID_VITALICIO);
  if (!publicKey || !privateKey || mensal === null || vitalicio === null) return null;
  const apiUrl = (env.DISRUPTY_API_URL || "https://api.disruptybr.app").replace(/\/+$/, "");
  if (!apiUrl.startsWith("https://")) return null;
  const token = env.DISRUPTY_WEBHOOK_TOKEN?.trim();
  return { apiUrl, publicKey, privateKey, offerId: { mensal, vitalicio }, webhookToken: token && token.length >= 16 ? token : null };
}

/* ------------------------------------ parsing ------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);

/** 87.93 / "87.93" / "87,93" (reais) → 8793 centavos. */
export function toMinor(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

const date = (v: unknown) => {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(" ", "T")}-03:00` : s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Disrupty sale status → Lastro event. Portuguese and English spellings; anything else is unknown. */
const STATUS: Record<string, PaymentEventType> = {
  PENDENTE: "payment.pending",
  PENDING: "payment.pending",
  AGUARDANDO_PAGAMENTO: "payment.pending",
  WAITING_PAYMENT: "payment.pending",
  PROCESSANDO: "payment.pending",
  PROCESSING: "payment.pending",
  PAGO: "payment.approved",
  PAID: "payment.approved",
  APROVADO: "payment.approved",
  APPROVED: "payment.approved",
  CONFIRMADO: "payment.approved",
  COMPLETED: "payment.approved",
  RECUSADO: "payment.failed",
  REFUSED: "payment.failed",
  FALHOU: "payment.failed",
  FAILED: "payment.failed",
  CANCELADO: "payment.failed",
  CANCELED: "payment.failed",
  CANCELLED: "payment.failed",
  EXPIRADO: "payment.expired",
  EXPIRED: "payment.expired",
  ESTORNADO: "payment.refunded",
  REEMBOLSADO: "payment.refunded",
  REFUNDED: "payment.refunded",
  CHARGEBACK: "payment.refunded",
  MED: "payment.refunded",
};

/** The sale object, wherever the API nests it ({ ... } or { data: { ... } } or { sale: { ... } }). */
const saleOf = (body: unknown): Obj => {
  const b = obj(body);
  if (b.id !== undefined && b.status !== undefined) return b;
  for (const k of ["data", "sale", "transaction"]) if (obj(b[k]).id !== undefined) return obj(b[k]);
  return b;
};

/** A sale as Disrupty reports it → a PaymentEvent (approval only with an amount). */
export function saleEvent(sale: Obj, eventId: string): PaymentEvent {
  const id = str(sale.id) as string;
  const status = (str(sale.status) ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const type = STATUS[status] ?? "unhandled";
  const payment = obj(sale.payment);
  const amountMinor = toMinor(sale.paidAmount ?? sale.amount ?? sale.total ?? payment.amount);
  const method = str(sale.paymentMethod ?? payment.method)?.toUpperCase();
  return {
    providerEventId: `${eventId}:${status || "UNKNOWN"}`,
    type,
    transactionId: id,
    refundedTransactionId: type === "payment.refunded" ? id : undefined,
    refundReason: status === "CHARGEBACK" || status === "MED" ? "chargeback" : type === "payment.refunded" ? "refund" : undefined,
    amountMinor,
    currency: str(sale.currency)?.toUpperCase() ?? "BRL",
    method: method === "PIX" ? "pix" : method === "CREDIT_CARD" || method === "CARD" ? "card" : undefined,
    gatewayEventName: type === "unhandled" ? `status ${status || "?"}` : undefined,
    occurredAt: date(sale.paidAt ?? sale.approvedAt ?? sale.updatedAt ?? sale.createdAt) ?? new Date(),
  };
}

/** The sale id a webhook refers to, wherever it is. Nothing else in the body is used. */
export function webhookSaleId(body: unknown): string | undefined {
  const b = obj(body);
  const candidates = [b.saleId, b.sale_id, b.transactionId, b.transaction_id, obj(b.data).id, obj(b.data).saleId, obj(b.sale).id, obj(b.transaction).id, b.id];
  for (const c of candidates) {
    const s = str(c);
    if (s && /^[A-Za-z0-9_-]{1,64}$/.test(s)) return s;
  }
  return undefined;
}

const tokenMatches = (presented: string | null, expected: string) =>
  !!presented && timingSafeEqual(createHash("sha256").update(presented).digest(), createHash("sha256").update(expected).digest());

/* ------------------------------------ adapter ------------------------------------ */

export function createDisruptyProvider(config: DisruptyConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const headers = { "X-Api-Public-Key": config.publicKey, "X-Api-Private-Key": config.privateKey, "Content-Type": "application/json", Accept: "application/json" };

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchImpl(`${config.apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  };

  const getSale = async (id: string, eventId: string): Promise<PaymentEvent | null> => {
    const r = await call(`/api/sales/${encodeURIComponent(id)}`);
    if (r.status !== 200) return null;
    const sale = saleOf(r.body);
    if (str(sale.id) !== id) return null; // the answer must be about the sale we asked for
    return saleEvent(sale, eventId);
  };

  return {
    id: "disrupty",
    // Card needs Disrupty's card schema / tokenization, not in the documentation received yet.
    methods: ["pix"],
    supportsSubscriptions: false,
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      if (req.method !== "pix") throw new Error("disrupty: only Pix is enabled");
      const c = req.customer;
      const payload = {
        offerId: req.plan.id === "mensal" ? config.offerId.mensal : config.offerId.vitalicio,
        amount: req.plan.amountMinor / 100, // reais, as Disrupty expects (19.9 / 99.9)
        paymentMethod: "PIX",
        customer: {
          name: c?.name ?? undefined,
          email: c?.email ?? undefined,
          document: c?.document ?? undefined,
          phone: c?.phone ?? undefined,
        },
      };
      const r = await call("/api/sales", { method: "POST", body: JSON.stringify(payload), headers: { "Idempotency-Key": req.orderId } });
      if (r.status !== 200 && r.status !== 201) throw new Error(`disrupty: create sale answered ${r.status}`);
      const sale = saleOf(r.body);
      const id = str(sale.id);
      const pix = obj(obj(sale.payment).pix);
      const copyPaste = str(pix.key) ?? str(pix.qrcode) ?? str(pix.code) ?? str(pix.copyPaste);
      if (!id || !copyPaste) throw new Error("disrupty: sale without id or Pix code");
      const expires = date(pix.expiresAt ?? pix.expirationDate ?? pix.expires_at);
      // The QR is drawn by Lastro from Disrupty's own copy-and-paste code (same payload).
      const svg = await QRCode.toString(copyPaste, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return {
        providerCheckoutId: id,
        providerPaymentId: id,
        expiresAt: expires,
        instructions: {
          kind: "pix",
          copyPaste,
          qrCodeImage: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
          expiresAt: expires?.toISOString() ?? null,
        },
      };
    },
    async parseWebhook(rawBody, _headers, url) {
      if (config.webhookToken && !tokenMatches(url.searchParams.get("token"), config.webhookToken)) return null;
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const saleId = webhookSaleId(body);
      if (!saleId) return null;
      // The webhook only says "look at sale X"; the truth comes from Disrupty's API.
      const ev = await getSale(saleId, `sale:${saleId}`);
      return ev ? [ev] : null;
    },
    async getPayment(providerPaymentId) {
      return getSale(providerPaymentId, `sale:${providerPaymentId}`);
    },
  };
}
