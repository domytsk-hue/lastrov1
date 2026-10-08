import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentEventType, PaymentProvider } from "./provider.ts";

/**
 * Simplify adapter — Pix on Lastro's own checkout (https://simplifybr.gitbook.io/documentacao-simplify).
 *
 *   POST {api}/pix/deposit { amount, payer, external_id: order id, webhookURL } → { internal_id, status, qrcode }
 *   webhook POST { event: "deposit.paid", internal_id, external_id, status, amount }
 *
 * Authentication: client-id + client-secret headers, server-side only.
 *
 * Simplify's documentation shows no signature on webhooks and no endpoint to query a deposit.
 * So each deposit is created with its OWN webhook URL carrying a secret token derived from the
 * order id (HMAC with SIMPLIFY_WEBHOOK_SECRET). That URL travels only from Lastro's server to
 * Simplify over HTTPS: a notification without the right token for that very order is refused,
 * and the order id in the body must match the one in the URL. Amount and order are then checked
 * like any gateway's.
 */

export interface SimplifyConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  /** Lastro's own secret (not Simplify's): signs each deposit's webhook URL. */
  webhookSecret: string;
}

/** How long Lastro shows (and reuses) one Pix code. Simplify doesn't document an expiry. */
export const PIX_TTL_MINUTES = 30;

/** Simplify is configured only with both credentials and a webhook secret of ≥ 32 characters. */
export function simplifyConfig(env: NodeJS.ProcessEnv = process.env): SimplifyConfig | null {
  const clientId = env.SIMPLIFY_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.SIMPLIFY_CLIENT_SECRET?.trim() ?? "";
  const webhookSecret = env.SIMPLIFY_WEBHOOK_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret || webhookSecret.length < 32) return null;
  const apiUrl = (env.SIMPLIFY_API_URL || "https://simplifybr.com/api/v1").replace(/\/+$/, "");
  if (!apiUrl.startsWith("https://")) return null;
  return { apiUrl, clientId, clientSecret, webhookSecret };
}

/* ------------------------------------ parsing ------------------------------------ */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "100.50" / 100.5 (reais) → 10050 centavos. */
export function toMinor(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** The token in one order's webhook URL. */
export const webhookToken = (secret: string, orderId: string) => createHmac("sha256", secret).update(`simplify-webhook:${orderId.toLowerCase()}`).digest("hex");

const tokenMatches = (secret: string, orderId: string, presented: string | null) => {
  if (!presented || !/^[0-9a-f]{64}$/.test(presented)) return false;
  return timingSafeEqual(Buffer.from(webhookToken(secret, orderId), "hex"), Buffer.from(presented, "hex"));
};

/** Simplify event → Lastro event. The status must agree with the event; anything else goes to a person. */
function eventType(event: string, status: string): PaymentEventType {
  if (event === "deposit.paid") return status === "approved" || status === "paid" ? "payment.approved" : "unhandled";
  if (event === "deposit.pending") return "payment.pending";
  // A Pix that was not paid (Simplify documents no refund event for deposits).
  if (event === "deposit.cancelled") return "payment.expired";
  return "unhandled";
}

/* ------------------------------------ adapter ------------------------------------ */

export function createSimplifyProvider(config: SimplifyConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  return {
    id: "simplify",
    methods: ["pix"],
    supportsSubscriptions: false,
    // name, e-mail, CPF and phone: all four are required by Simplify's deposit.
    async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
      if (req.method !== "pix") throw new Error("simplify: only Pix");
      const c = req.customer;
      if (!c?.name || !c.email || !c.document || !c.phone) throw new Error("simplify: payer data required");
      const origin = new URL(req.returnUrl).origin;
      const webhookURL = `${origin}/api/payments/webhook/simplify?order=${req.orderId}&token=${webhookToken(config.webhookSecret, req.orderId)}`;
      const payload = {
        amount: req.plan.amountMinor / 100, // reais, from the catalog
        payer: { name: c.name, email: c.email, document: c.document, phone: c.phone.replace(/^\+55/, "").replace(/\D/g, "") },
        external_id: req.orderId,
        webhookURL,
      };
      const res = await fetchImpl(`${config.apiUrl}/pix/deposit`, {
        method: "POST",
        headers: { "client-id": config.clientId, "client-secret": config.clientSecret, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      const text = await res.text();
      let body: Obj = {};
      try {
        body = obj(JSON.parse(text));
      } catch {
        body = {};
      }
      if (res.status !== 200 && res.status !== 201) {
        // Simplify's message and the names of the fields it refused — never their values.
        const reason = [str(body.error), str(body.message), ...Object.keys(obj(body.errors))].filter(Boolean).join(" | ").slice(0, 300);
        throw new Error(`simplify: create deposit answered ${res.status} ${reason}`);
      }
      const id = str(body.internal_id);
      const copyPaste = str(body.qrcode);
      if (!id || !copyPaste) throw new Error("simplify: deposit without id or Pix code");
      if (str(body.external_id) && str(body.external_id) !== req.orderId) throw new Error("simplify: deposit for another order");
      if (toMinor(body.amount) !== undefined && toMinor(body.amount) !== req.plan.amountMinor) throw new Error("simplify: deposit with another amount");
      // The QR is drawn by Lastro from Simplify's own copy-and-paste code (same payload).
      const svg = await QRCode.toString(copyPaste, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      const expiresAt = new Date(Date.now() + PIX_TTL_MINUTES * 60_000);
      return {
        providerCheckoutId: id,
        providerPaymentId: id,
        expiresAt,
        instructions: { kind: "pix", copyPaste, qrCodeImage: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, expiresAt: expiresAt.toISOString() },
      };
    },
    async parseWebhook(rawBody, _headers, url) {
      const orderId = url.searchParams.get("order")?.toLowerCase() ?? "";
      if (!UUID.test(orderId) || !tokenMatches(config.webhookSecret, orderId, url.searchParams.get("token"))) return null;
      let body: Obj;
      try {
        body = obj(JSON.parse(rawBody));
      } catch {
        return null;
      }
      const event = str(body.event)?.toLowerCase() ?? "";
      const id = str(body.internal_id);
      // The notification must be about the order its URL was made for.
      if (!id || str(body.external_id)?.toLowerCase() !== orderId) return null;
      if (event.startsWith("withdrawal.")) return [];
      const type = eventType(event, str(body.status)?.toLowerCase() ?? "");
      const at = str(body.timestamp) ? new Date(str(body.timestamp) as string) : new Date();
      const ev: PaymentEvent = {
        providerEventId: `${id}:${event || "unknown"}`,
        type,
        orderId,
        transactionId: id,
        amountMinor: toMinor(body.amount),
        currency: "BRL",
        method: "pix",
        gatewayEventName: type === "unhandled" ? `${event || "?"} / ${str(body.status) ?? "?"}` : undefined,
        occurredAt: Number.isNaN(at.getTime()) ? new Date() : at,
      };
      return [ev];
    },
  };
}
