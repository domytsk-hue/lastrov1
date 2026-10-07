import type { CentralisConfig } from "../env.ts";
import { toCentralisV1 } from "./v1.ts";
import type { Envelope } from "./outbox.ts";

/**
 * The only place that talks HTTP to Centralis Hub: authentication, the v1 wire format,
 * timeout and error normalization. Retries are the outbox's job — one attempt per call.
 *
 *   POST {CENTRALIS_API_URL}/api/v1/events
 *   Authorization: Bearer cx_live_….<secret>     (the system's integration key)
 *   { "events": [ …up to 100… ] }
 *
 * Centralis answers per event: accepted | duplicate | rejected | failed.
 */

export interface CentralisError {
  code: "not_configured" | "timeout" | "network" | "unauthorized" | "rejected" | "server_error" | "rate_limited";
  /** Whether trying again later can help. */
  retryable: boolean;
  status?: number;
  message: string;
}

/** What happened to each event in a delivered batch. */
export type EventOutcome = { status: "sent" } | { status: "rejected"; error: string } | { status: "retry"; error: string };

export type SendResult = { ok: true; outcomes: Record<string, EventOutcome> } | { ok: false; error: CentralisError };

export interface CentralisClient {
  sendEvents(events: Envelope[]): Promise<SendResult>;
}

export const EVENTS_PATH = "/api/v1/events";
export const MAX_BATCH = 100;

interface V1Result {
  event_id: string | null;
  status: "accepted" | "duplicate" | "rejected" | "failed";
  error?: string;
  errors?: Array<{ path: string; message: string }>;
}

export function createCentralisClient(config: CentralisConfig, fetchImpl: typeof fetch = fetch): CentralisClient {
  return {
    async sendEvents(envelopes) {
      if (!config.apiUrl || !config.apiKey) {
        return { ok: false, error: { code: "not_configured", retryable: true, message: "CENTRALIS_API_URL / CENTRALIS_API_KEY missing." } };
      }
      const body = JSON.stringify({ events: envelopes.map(toCentralisV1) });
      let res: Response;
      try {
        res = await fetchImpl(config.apiUrl + EVENTS_PATH, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        return { ok: false, error: { code: timeout ? "timeout" : "network", retryable: true, message: timeout ? "Timed out" : "Network error" } };
      }

      const status = res.status;
      // 401: wrong/revoked key — a configuration problem; keep events and retry with backoff.
      if (status === 401) return { ok: false, error: { code: "unauthorized", retryable: true, status, message: "Integration key rejected" } };
      if (status === 429) return { ok: false, error: { code: "rate_limited", retryable: true, status, message: "Rate limited" } };
      if (status === 408 || status >= 500) return { ok: false, error: { code: "server_error", retryable: true, status, message: `HTTP ${status}` } };

      let parsed: { results?: V1Result[] } | null = null;
      try {
        parsed = (await res.json()) as { results?: V1Result[] };
      } catch {
        parsed = null;
      }
      if ((status === 200 || status === 422) && parsed?.results) {
        const outcomes: Record<string, EventOutcome> = {};
        for (const r of parsed.results) {
          if (!r.event_id) continue;
          const detail = r.errors?.map((x) => `${x.path}: ${x.message}`).join("; ") || r.error || r.status;
          outcomes[r.event_id] =
            r.status === "accepted" || r.status === "duplicate" ? { status: "sent" } : r.status === "rejected" ? { status: "rejected", error: detail } : { status: "retry", error: detail };
        }
        return { ok: true, outcomes };
      }
      return { ok: false, error: { code: "rejected", retryable: false, status, message: `HTTP ${status}` } };
    },
  };
}
