import "server-only";
import type { PaymentProvider } from "./provider.ts";
import { createSandboxProvider, type SandboxState } from "./sandbox.ts";

/**
 * Which gateways exist in this deployment. Adding Mercado Pago / Asaas / Pagar.me / Stripe
 * means writing one PaymentProvider adapter and registering it here — nothing else changes.
 * Until then PAYMENT_PROVIDER is empty and checkout answers "payments unavailable".
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
  if (id === "sandbox") {
    if (!sandboxAllowed(env)) return null;
    g.__lastroSandbox ??= { payments: new Map(), cancelled: new Set(), failCancellation: false };
    return createSandboxProvider(env.PAYMENT_SANDBOX_SECRET as string, g.__lastroSandbox);
  }
  return null;
}

/** The gateway new checkouts use (PAYMENT_PROVIDER), or null when none is configured. */
export const activePaymentProvider = (env: NodeJS.ProcessEnv = process.env) => getPaymentProvider(env.PAYMENT_PROVIDER, env);
