import "server-only";
import type { PaymentProvider } from "./provider.ts";
import { createSandboxProvider } from "./sandbox.ts";

/**
 * Which gateways exist in this deployment. Adding Stripe / Mercado Pago / Asaas / Pagar.me
 * means writing one PaymentProvider adapter and registering it here — nothing else changes.
 */
export function getPaymentProvider(id: string | null | undefined, env: NodeJS.ProcessEnv = process.env): PaymentProvider | null {
  if (id === "sandbox") {
    const allowed = env.NODE_ENV !== "production" || env.PAYMENT_SANDBOX_ALLOW_PRODUCTION === "true";
    return allowed && env.PAYMENT_SANDBOX_SECRET ? createSandboxProvider(env.PAYMENT_SANDBOX_SECRET) : null;
  }
  return null;
}

/** The gateway new checkouts use (PAYMENT_PROVIDER). */
export const activePaymentProvider = (env: NodeJS.ProcessEnv = process.env) => getPaymentProvider(env.PAYMENT_PROVIDER, env);
