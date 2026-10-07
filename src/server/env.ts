import "server-only";

/**
 * Server configuration. Read only from server modules — nothing here may reach the browser.
 * Centralis secrets never use the NEXT_PUBLIC_ prefix.
 */

const bool = (v: string | undefined) => v === "true" || v === "1";

export interface CentralisConfig {
  enabled: boolean;
  apiUrl: string;
  productId: string;
  apiKey: string;
  webhookSecret: string;
  schemaVersion: string;
  timeoutMs: number;
}

export function centralisConfig(env: NodeJS.ProcessEnv = process.env): CentralisConfig {
  return {
    enabled: bool(env.CENTRALIS_ENABLED),
    apiUrl: (env.CENTRALIS_API_URL ?? "").replace(/\/+$/, ""),
    productId: env.CENTRALIS_PRODUCT_ID ?? "",
    apiKey: env.CENTRALIS_API_KEY ?? "",
    webhookSecret: env.CENTRALIS_WEBHOOK_SECRET ?? "",
    schemaVersion: env.CENTRALIS_SCHEMA_VERSION || "1.0",
    timeoutMs: Number(env.CENTRALIS_TIMEOUT_MS) || 8000,
  };
}

/** Public site URL, used to build affiliate links. Never hardcoded. */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Bearer token for scheduled jobs (e.g. Vercel Cron draining the outbox). */
export function cronSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.CRON_SECRET ?? "";
}
