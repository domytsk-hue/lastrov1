import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { createUserSync } from "../centralis/user-sync.ts";

/**
 * Plan AUTHORIZATION ("may this user use the product now?"), separate from authentication.
 *
 * Access is a set of entitlements, each born from one confirmed charge (or an administrative
 * grant written by a person). It is computed at request time from their dates, so a monthly
 * period simply ends — no job, no app visit needed. Nothing a user can send creates, extends
 * or changes one: only the payment pipeline and the database operator write this table.
 *
 *   vitalício  → one entitlement, no end
 *   mensal     → one entitlement per paid month; consecutive payments stack
 *   refund / chargeback → only THAT charge's entitlement is revoked (a late monthly event can
 *                         never touch a lifetime entitlement)
 */

export type { AccessState, AccessSummary, PendingOrderSummary } from "../../config/access.ts";
import type { AccessState, AccessSummary } from "../../config/access.ts";

type PaywallEnv = { LASTRO_PAYWALL?: string; [key: string]: string | undefined };

export const paywallEnabled = (env: PaywallEnv = process.env) => env.LASTRO_PAYWALL === "on";

/** Evaluate entitlements as if the paywall were on (what the account really holds). */
export const HOLDINGS: PaywallEnv = { LASTRO_PAYWALL: "on" };

/* ------------------------------ monthly calendar rule ------------------------------ */

/**
 * Monthly periods follow the calendar in Brasília time (UTC−3, no daylight saving since
 * 2019): same day next month, at the same time; when that day doesn't exist the period ends
 * on the month's last day (31/01 → 28/02 or 29/02; 31/03 → 30/04). Used only when the
 * gateway does not state the paid period itself.
 */
const BRT_OFFSET_MS = -3 * 3_600_000;

export function addBillingMonth(from: Date, months = 1): Date {
  const local = new Date(from.getTime() + BRT_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + months;
  const day = local.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const target = Date.UTC(y, m, Math.min(day, lastDay), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  return new Date(target - BRT_OFFSET_MS);
}

/* ---------------------------------- reading access ---------------------------------- */

interface EntitlementRow {
  plan_id: string | null;
  source: string;
  starts_at: Date;
  ends_at: Date | null;
}

const toDate = (v: Date | string | null) => (v == null ? null : new Date(v));

export async function getAccess(db: Db, userId: string, now = new Date(), env: PaywallEnv = process.env): Promise<AccessSummary> {
  const rows = (
    await db.query<EntitlementRow>(
      `select plan_id, source, starts_at, ends_at from lastro.access_entitlements where user_id = $1 and status = 'active'`,
      [userId],
    )
  ).map((r) => ({ ...r, starts_at: toDate(r.starts_at)!, ends_at: toDate(r.ends_at) }));

  const current = rows.filter((r) => r.starts_at <= now && (!r.ends_at || r.ends_at > now));
  const lifetime = current.some((r) => r.plan_id === "vitalicio" && !r.ends_at);
  const monthlyNow = current.filter((r) => r.plan_id === "mensal");
  const granted = current.some((r) => r.source === "admin");
  // Paid months chain: the latest end among monthly entitlements that are current or start
  // exactly where another ends (paid in advance).
  let validUntil: Date | null = null;
  if (monthlyNow.length) {
    validUntil = monthlyNow.reduce((max, r) => (r.ends_at && r.ends_at > max ? r.ends_at : max), monthlyNow[0].ends_at ?? now);
    const future = rows.filter((r) => r.plan_id === "mensal" && r.starts_at > now).sort((a, b) => +a.starts_at - +b.starts_at);
    for (const f of future) if (validUntil && f.starts_at <= validUntil && f.ends_at && f.ends_at > validUntil) validUntil = f.ends_at;
  }
  const hadMonthly = rows.some((r) => r.plan_id === "mensal");

  const state: AccessState = lifetime ? "lifetime" : monthlyNow.length ? "monthly" : granted ? "granted" : hadMonthly ? "expired" : "none";
  const paywall = paywallEnabled(env);

  const [sub] = await db.query<{ status: string; cancel_at_period_end: boolean; current_period_end: Date | null }>(
    `select status, cancel_at_period_end, current_period_end from lastro.subscriptions where user_id = $1 and status <> 'cancelled' order by created_at desc limit 1`,
    [userId],
  );
  const [cancelTask] = await db.query(`select 1 from lastro.payment_reviews where user_id = $1 and kind = 'cancel_renewal' and status = 'open' limit 1`, [userId]);
  const [pending] = await db.query<{ id: string; plan_id: string; payment_method: string | null; purpose: "new" | "upgrade"; created_at: Date; expires_at: Date | null }>(
    `select id, plan_id, payment_method, purpose, created_at, expires_at from lastro.orders where user_id = $1 and status = 'pending' limit 1`,
    [userId],
  );
  const [u] = await db.query<{ checkout_deferred_at: Date | null }>(`select checkout_deferred_at from lastro.users where id = $1`, [userId]);

  return {
    paywall,
    active: !paywall || lifetime || monthlyNow.length > 0 || granted,
    state,
    planId: lifetime ? "vitalicio" : monthlyNow.length ? "mensal" : null,
    validUntil: state === "monthly" && validUntil ? validUntil.toISOString() : null,
    subscription: sub
      ? {
          status: sub.status,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          // Only a real recurring subscription has a next charge; a Pix month just ends.
          nextChargeAt: sub.status === "active" && !sub.cancel_at_period_end && sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
        }
      : null,
    renewalCancellationPending: !!cancelTask,
    pendingOrder: pending
      ? {
          id: pending.id,
          planId: pending.plan_id,
          method: pending.payment_method,
          purpose: pending.purpose,
          createdAt: new Date(pending.created_at).toISOString(),
          expiresAt: pending.expires_at ? new Date(pending.expires_at).toISOString() : null,
        }
      : null,
    deferred: !!u?.checkout_deferred_at,
  };
}

/* ---------------------------------- writing access ---------------------------------- */

/**
 * Creates the entitlement for one confirmed charge. Idempotent: the unique charge_id means a
 * replayed event can't grant the same period twice.
 */
export async function grantForCharge(
  db: Db,
  c: { userId: string; chargeId: string; planId: string; billing: "one_time" | "monthly"; source: "purchase" | "renewal"; paidAt: Date; periodStart?: Date; periodEnd?: Date },
) {
  let starts = c.paidAt;
  let ends: Date | null = null;
  if (c.billing === "monthly") {
    if (c.periodStart && c.periodEnd && c.periodEnd > c.periodStart) {
      starts = c.periodStart;
      ends = c.periodEnd;
    } else {
      // Paying while a month is still running extends it instead of overlapping it.
      const [last] = await db.query<{ ends_at: Date }>(
        `select max(ends_at) as ends_at from lastro.access_entitlements where user_id = $1 and plan_id = 'mensal' and status = 'active' and ends_at > $2`,
        [c.userId, c.paidAt],
      );
      if (last?.ends_at) starts = new Date(last.ends_at);
      ends = addBillingMonth(starts);
    }
  }
  await db.query(
    `insert into lastro.access_entitlements (id, user_id, plan_id, source, charge_id, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (charge_id) do nothing`,
    [randomUUID(), c.userId, c.planId, c.source, c.chargeId, starts, ends],
  );
  return { startsAt: starts, endsAt: ends };
}

export async function revokeForCharge(db: Db, chargeId: string, reason: string, at: Date) {
  await db.query(
    `update lastro.access_entitlements set status = 'revoked', revoked_reason = $2, revoked_at = $3 where charge_id = $1 and status = 'active'`,
    [chargeId, reason, at],
  );
}

/**
 * Keeps users.plan_id (what Centralis sees) equal to the effective plan, and tells Centralis
 * when it changes. Derived from entitlements, so it can only move with them.
 */
export async function refreshUserPlan(db: Db, config: CentralisConfig, userId: string, now = new Date()) {
  const access = await getAccess(db, userId, now, HOLDINGS);
  const [u] = await db.query<{ plan_id: string | null }>(`select plan_id from lastro.users where id = $1 for update`, [userId]);
  if (!u || u.plan_id === access.planId) return false;
  await db.query(`update lastro.users set plan_id = $2, updated_at = now() where id = $1`, [userId, access.planId]);
  await createUserSync(config).planChanged(db, userId, u.plan_id);
  return true;
}

/** Monthly time that ran out: mirror it to users.plan_id (access itself already ended). */
export async function expireLapsedPlans(db: Db, config: CentralisConfig, now = new Date(), limit = 200) {
  const lapsed = await db.query<{ id: string }>(
    `select u.id from lastro.users u
      where u.plan_id = 'mensal'
        and not exists (select 1 from lastro.access_entitlements e
                         where e.user_id = u.id and e.plan_id = 'mensal' and e.status = 'active'
                           and e.starts_at <= $1 and (e.ends_at is null or e.ends_at > $1))
      limit $2`,
    [now, limit],
  );
  let changed = 0;
  for (const { id } of lapsed) if (await db.tx((tx) => refreshUserPlan(tx, config, id, now))) changed++;
  return changed;
}
