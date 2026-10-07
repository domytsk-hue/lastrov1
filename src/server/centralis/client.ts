import type { CentralisConfig } from "../env.ts";
import { signRequest } from "./signature.ts";

/**
 * The only place that talks HTTP to Centralis: auth, signing, timeout and error
 * normalization. Retries are the outbox's job — this client makes exactly one attempt.
 */

export interface CentralisError {
  code: "not_configured" | "timeout" | "network" | "rejected" | "server_error" | "rate_limited";
  /** Whether trying again later can help. A rejected payload (4xx) will not get better. */
  retryable: boolean;
  status?: number;
  message: string;
}

export type SendResult = { ok: true } | { ok: false; error: CentralisError };

export interface CentralisClient {
  sendEvents(events: object[]): Promise<SendResult>;
}

export const EVENTS_PATH = "/v1/events";

export function createCentralisClient(config: CentralisConfig, fetchImpl: typeof fetch = fetch): CentralisClient {
  return {
    async sendEvents(events) {
      if (!config.apiUrl || !config.apiKey || !config.productId || !config.webhookSecret) {
        return { ok: false, error: { code: "not_configured", retryable: true, message: "Centralis is not fully configured." } };
      }
      const body = JSON.stringify({ schema_version: config.schemaVersion, product_id: config.productId, events });
      const ts = Math.floor(Date.now() / 1000);
      const path = new URL(config.apiUrl + EVENTS_PATH).pathname;
      try {
        const res = await fetchImpl(config.apiUrl + EVENTS_PATH, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
            "x-centralis-product-id": config.productId,
            "x-centralis-timestamp": String(ts),
            "x-centralis-signature": signRequest(config.webhookSecret, ts, "POST", path, body),
          },
          body,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        if (res.ok) return { ok: true };
        const status = res.status;
        if (status === 429) return { ok: false, error: { code: "rate_limited", retryable: true, status, message: "Rate limited" } };
        if (status === 408 || status >= 500) return { ok: false, error: { code: "server_error", retryable: true, status, message: `HTTP ${status}` } };
        return { ok: false, error: { code: "rejected", retryable: false, status, message: `HTTP ${status}` } };
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        return { ok: false, error: { code: timeout ? "timeout" : "network", retryable: true, message: timeout ? "Timed out" : "Network error" } };
      }
    },
  };
}
