import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing shared by both directions (Centralis → Lastro commands, Lastro → Centralis
 * events). The signed string binds time, method, path and the exact body bytes:
 *
 *   v1 = HMAC_SHA256(secret, `${timestamp}.${METHOD}.${path}.${sha256_hex(body)}`)
 *
 * Headers: X-Centralis-Timestamp (unix seconds), X-Centralis-Signature: v1=<hex>.
 */

export const SIGNATURE_TOLERANCE_S = 300;

export const sha256Hex = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");

export function signRequest(secret: string, timestamp: number, method: string, path: string, body: string): string {
  const base = `${timestamp}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`;
  return `v1=${createHmac("sha256", secret).update(base, "utf8").digest("hex")}`;
}

export type SignatureCheck = { ok: true } | { ok: false; code: "missing_signature" | "invalid_timestamp" | "stale_timestamp" | "bad_signature" | "not_configured" };

export function verifyRequest(
  secret: string,
  headers: { timestamp: string | null; signature: string | null },
  method: string,
  path: string,
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!secret) return { ok: false, code: "not_configured" };
  if (!headers.signature || !headers.timestamp) return { ok: false, code: "missing_signature" };
  if (!/^\d{9,12}$/.test(headers.timestamp)) return { ok: false, code: "invalid_timestamp" };
  const ts = Number(headers.timestamp);
  if (Math.abs(nowS - ts) > SIGNATURE_TOLERANCE_S) return { ok: false, code: "stale_timestamp" };
  const expected = Buffer.from(signRequest(secret, ts, method, path, body));
  const given = Buffer.from(headers.signature.trim());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, code: "bad_signature" };
  return { ok: true };
}
