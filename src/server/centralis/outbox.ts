import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import type { CentralisClient } from "./client.ts";
import { centralisLog } from "./log.ts";
import { findForbiddenKeys } from "./serialize.ts";

/**
 * Transactional outbox. Events are written with the change that caused them (same `db`/tx),
 * then delivered later with retry and backoff. Centralis being down never blocks Lastro.
 *
 *   pending → processing → sent
 *                        ↘ pending (retry, with backoff) … → failed (after MAX_ATTEMPTS
 *                                                              or a non-retryable rejection)
 */

export type EventType =
  | "page_view"
  | "session.started"
  | "affiliate.click"
  | "affiliate.attributed"
  | "signup"
  | "login"
  | "checkout.started"
  | "purchase"
  | "refund"
  | "payment.failed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.updated"
  | "subscription.cancelled"
  | "user.created"
  | "user.updated"
  | "user.plan_changed"
  | "user.status_changed"
  | "user.subscription_changed"
  | "user.deactivated"
  | "affiliate.promoted"
  | "affiliate.updated"
  | "affiliate.suspended"
  | "affiliate.activated";

/** Analytics noise is only recorded while the integration is on; everything else always is. */
const ANALYTICS: EventType[] = ["page_view", "session.started"];

export const MAX_ATTEMPTS = 12;
const LOCK_TIMEOUT = "5 minutes";

/** 30s, 2m, 8m, 32m, 2h8m, then capped at 6h. */
export function backoffSeconds(attempt: number, jitter = Math.random()): number {
  const base = Math.min(30 * 4 ** Math.max(0, attempt - 1), 6 * 3600);
  return Math.round(base * (1 + 0.2 * jitter));
}

export interface Envelope {
  schema_version: string;
  event_id: string;
  event: EventType;
  timestamp: string;
  product_id: string;
  [key: string]: unknown;
}

export async function enqueue(
  db: Db,
  config: CentralisConfig,
  event: EventType,
  body: Record<string, unknown>,
  at: Date = new Date(),
): Promise<string | null> {
  if (!config.enabled && ANALYTICS.includes(event)) return null;
  const envelope: Envelope = {
    schema_version: config.schemaVersion,
    event_id: randomUUID(),
    event,
    timestamp: at.toISOString(),
    product_id: config.productId,
    ...body,
  };
  const forbidden = findForbiddenKeys(envelope);
  if (forbidden.length) {
    // A programming error, not a runtime condition: refuse loudly, never send.
    throw new Error(`Refusing to queue ${event}: forbidden keys ${forbidden.join(", ")}`);
  }
  await db.query(
    `insert into lastro.centralis_outbox (id, event_id, event_type, payload) values ($1, $2, $3, $4::jsonb)`,
    [randomUUID(), envelope.event_id, event, JSON.stringify(envelope)],
  );
  return envelope.event_id;
}

interface OutboxRow {
  id: string;
  event_id: string;
  payload: Envelope | string;
  attempts: number;
}

/** Claims due events (skipping ones another worker holds) and marks them processing. */
async function claim(db: Db, limit: number): Promise<OutboxRow[]> {
  return db.query<OutboxRow>(
    `update lastro.centralis_outbox set status = 'processing', locked_at = now(), attempts = attempts + 1
       where id in (
         select id from lastro.centralis_outbox
          where (status = 'pending' and next_retry_at <= now())
             or (status = 'processing' and locked_at < now() - interval '${LOCK_TIMEOUT}')
          order by created_at
          limit $1
          for update skip locked)
     returning id, event_id, payload, attempts`,
    [limit],
  );
}

export interface FlushResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

export async function flushOutbox(db: Db, config: CentralisConfig, client: CentralisClient, limit = 25): Promise<FlushResult> {
  const result: FlushResult = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  if (!config.enabled) return result;
  const rows = await claim(db, limit);
  result.claimed = rows.length;
  if (!rows.length) return result;

  // product_id is stamped at delivery too, so events queued before configuration still carry it.
  const events = rows.map((r) => ({ ...(typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload), product_id: config.productId }) as Envelope);
  const res = await client.sendEvents(events);

  const markSent = async (ids: string[]) => {
    if (!ids.length) return;
    await db.query(`update lastro.centralis_outbox set status = 'sent', sent_at = now(), last_error = null, locked_at = null where id = any($1::uuid[])`, [ids]);
    await db.query(
      `insert into lastro.integration_state (key, value, updated_at) values ('last_success_at', to_jsonb(now()), now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
  };
  const markRetryOrFail = async (r: OutboxRow, error: string, retryable: boolean) => {
    const give = !retryable || r.attempts >= MAX_ATTEMPTS;
    await db.query(
      `update lastro.centralis_outbox
          set status = $2, last_error = $3, locked_at = null,
              next_retry_at = now() + make_interval(secs => $4)
        where id = $1`,
      [r.id, give ? "failed" : "pending", error.slice(0, 500), give ? 0 : backoffSeconds(r.attempts)],
    );
    if (give) result.failed++;
    else result.retried++;
    centralisLog(give ? "error" : "warn", give ? "event delivery failed permanently" : "event delivery will retry", { event_id: r.event_id, code: error.slice(0, 80) });
  };

  if (!res.ok) {
    for (const r of rows) await markRetryOrFail(r, `${res.error.code}${res.error.status ? ` ${res.error.status}` : ""}`, res.error.retryable);
    return result;
  }

  // Per-event outcomes: accepted/duplicate → sent; rejected → failed (it won't get better);
  // failed or missing → retry later.
  const sent: string[] = [];
  for (const r of rows) {
    const o = res.outcomes[r.event_id];
    if (o?.status === "sent") sent.push(r.id);
    else if (o?.status === "rejected") await markRetryOrFail(r, `rejected: ${o.error}`, false);
    else await markRetryOrFail(r, o ? `failed: ${o.error}` : "no result for event", true);
  }
  await markSent(sent);
  result.sent = sent.length;
  if (sent.length) centralisLog("info", "events delivered", { count: sent.length });
  return result;
}

export interface OutboxHealth {
  pending: number;
  processing: number;
  failed: number;
  sent: number;
  oldest_pending_at: string | null;
  last_success_at: string | null;
}

export async function outboxHealth(db: Db): Promise<OutboxHealth> {
  const [c] = await db.query<{ pending: number; processing: number; failed: number; sent: number; oldest: Date | null }>(
    `select count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where status = 'processing')::int as processing,
            count(*) filter (where status = 'failed')::int as failed,
            count(*) filter (where status = 'sent')::int as sent,
            min(created_at) filter (where status = 'pending') as oldest
       from lastro.centralis_outbox`,
  );
  const [s] = await db.query<{ value: string }>(`select value #>> '{}' as value from lastro.integration_state where key = 'last_success_at'`);
  return {
    pending: c.pending,
    processing: c.processing,
    failed: c.failed,
    sent: c.sent,
    oldest_pending_at: c.oldest ? new Date(c.oldest).toISOString() : null,
    last_success_at: s ? new Date(s.value).toISOString() : null,
  };
}

/** Puts failed events back in line (e.g. after fixing a Centralis-side rejection). Event ids are kept. */
export async function requeueFailed(db: Db): Promise<number> {
  const rows = await db.query(`update lastro.centralis_outbox set status = 'pending', next_retry_at = now(), attempts = 0 where status = 'failed' returning id`);
  return rows.length;
}
