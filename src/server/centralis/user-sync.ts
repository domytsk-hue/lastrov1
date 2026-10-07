import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue, type EventType } from "./outbox.ts";
import { serializeUserForCentralis, type CentralisUserSource } from "./serialize.ts";

/**
 * CentralisUserSyncService — every user change that Centralis should know about goes
 * through here, inside the caller's transaction. Payloads only ever contain the allowlisted
 * user shape from serializeUserForCentralis.
 */

type UserEvent = Extract<EventType, `user.${string}`>;

export async function loadCentralisUser(db: Db, userId: string): Promise<CentralisUserSource | null> {
  const [u] = await db.query<CentralisUserSource>(
    `select u.id, u.name, u.email, u.phone, u.status, u.plan_id, p.name as plan_name, u.subscription_status, u.created_at, u.updated_at
       from lastro.users u left join lastro.plans p on p.id = u.plan_id
      where u.id = $1`,
    [userId],
  );
  return u ?? null;
}

export function createUserSync(config: CentralisConfig) {
  const emit = async (db: Db, event: UserEvent, userId: string, extra: Record<string, unknown> = {}) => {
    const user = await loadCentralisUser(db, userId);
    if (!user) return null;
    return enqueue(db, config, event, { user: serializeUserForCentralis(user), ...extra });
  };
  return {
    created: (db: Db, userId: string) => emit(db, "user.created", userId),
    updated: (db: Db, userId: string, reason?: "initial_sync" | "resync") => emit(db, "user.updated", userId, reason ? { reason } : {}),
    planChanged: (db: Db, userId: string, previousPlanId: string | null) => emit(db, "user.plan_changed", userId, { previous_plan_id: previousPlanId }),
    statusChanged: (db: Db, userId: string, previousStatus: string) => emit(db, "user.status_changed", userId, { previous_status: previousStatus }),
    subscriptionChanged: (db: Db, userId: string) => emit(db, "user.subscription_changed", userId),
    deactivated: (db: Db, userId: string) => emit(db, "user.deactivated", userId),
  };
}

/**
 * Initial sync in batches: queues one `user.updated` (reason initial_sync) per user, by id
 * order, `limit` at a time. Returns the cursor to continue from, or null when done.
 */
export async function syncUsersBatch(db: Db, config: CentralisConfig, after: string | null, limit = 200): Promise<{ queued: number; next: string | null }> {
  const sync = createUserSync(config);
  const rows = await db.query<{ id: string }>(`select id from lastro.users where ($1::text is null or id > $1) order by id limit $2`, [after, limit]);
  for (const r of rows) await sync.updated(db, r.id, "initial_sync");
  return { queued: rows.length, next: rows.length === limit ? rows[rows.length - 1].id : null };
}

/**
 * Runs one bounded step of the first-ever sync, the first time the integration is enabled.
 * Progress is stored, so it resumes across flushes and restarts.
 */
export async function continueInitialSync(db: Db, config: CentralisConfig, batch = 200): Promise<"done" | "progressing" | "skipped"> {
  if (!config.enabled) return "skipped";
  return db.tx(async (tx) => {
    const [state] = await tx.query<{ value: { done?: boolean; cursor?: string | null } }>(
      `select value from lastro.integration_state where key = 'initial_user_sync' for update`,
    );
    if (state?.value.done) return "done";
    const { next } = await syncUsersBatch(tx, config, state?.value.cursor ?? null, batch);
    const value = next ? { done: false, cursor: next } : { done: true, finished_at: new Date().toISOString() };
    await tx.query(
      `insert into lastro.integration_state (key, value, updated_at) values ('initial_user_sync', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(value)],
    );
    return next ? "progressing" : "done";
  });
}
