import "server-only";
import type { PaymentMethod, PaymentProvider } from "./provider.ts";
import { createSandboxProvider, type SandboxState } from "./sandbox.ts";
import { createMercadoPagoProvider, mercadoPagoConfig } from "./mercadopago.ts";

/**
 * Which gateways exist in this deployment. Each payment method has its own gateway:
 *   PAYMENT_PROVIDER_PIX  — Pix  ("simplify", once its adapter exists)
 *   PAYMENT_PROVIDER_CARD — card ("mercadopago")
 * PAYMENT_PROVIDER sets both at once (e.g. "sandbox" in isolated tests). A method whose gateway
 * is missing or not fully configured simply isn't offered; none at all → "payments unavailable".
 * Each order remembers its gateway, so webhooks, status checks and refunds go to the right one.
 */

/**
 * The sandbox only runs in an isolated environment: development, or a production build on
 * the embedded test database (never with a real DATABASE_URL). There is no override.
 */
export function sandboxAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.PAYMENT_SANDBOX_SECRET) return false;
  if (env.NODE_ENV !== "production") return !env.DATABASE_URL;
  return !env.DATABASE_URL && !!env.LASTRO_ALLOW_EMBEDDED_DB;
}

const g = globalThis as unknown as { __lastroSandbox?: SandboxState };

export function getPaymentProvider(id: string | null | undefined, env: NodeJS.ProcessEnv = process.env): PaymentProvider | null {
  if (id === "mercadopago") {
    // Only when fully configured (access token, public key, webhook secret); otherwise unavailable.
    const config = mercadoPagoConfig(env);
    return config ? createMercadoPagoProvider(config) : null;
  }
  if (id === "sandbox") {
    if (!sandboxAllowed(env)) return null;
    g.__lastroSandbox ??= { payments: new Map(), cancelled: new Set(), failCancellation: false };
    return createSandboxProvider(env.PAYMENT_SANDBOX_SECRET as string, g.__lastroSandbox);
  }
  return null;
}

/** The gateway that takes `method` in new checkouts, or null when that method isn't offered. */
export function providerForMethod(method: PaymentMethod, env: NodeJS.ProcessEnv = process.env): PaymentProvider | null {
  const id = (method === "pix" ? env.PAYMENT_PROVIDER_PIX : env.PAYMENT_PROVIDER_CARD) || env.PAYMENT_PROVIDER;
  const p = getPaymentProvider(id, env);
  return p && p.methods.includes(method) ? p : null;
}

/** Every method offered right now, with its gateway (Pix first). */
export function checkoutProviders(env: NodeJS.ProcessEnv = process.env): { method: PaymentMethod; provider: PaymentProvider }[] {
  return (["pix", "card"] as PaymentMethod[]).flatMap((method) => {
    const provider = providerForMethod(method, env);
    return provider ? [{ method, provider }] : [];
  });
}

/** Looks a gateway up by the id an order or subscription stored. */
export const providerById = (id: string) => getPaymentProvider(id);
