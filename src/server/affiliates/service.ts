import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";

/**
 * Affiliate profiles. An affiliate is not a second account: it is a profile attached to an
 * existing user. Only Centralis creates or changes them (see centralis/actions.ts); users
 * never can.
 */

export type AffiliateStatus = "active" | "suspended" | "disabled";
export const AFFILIATE_STATUSES: AffiliateStatus[] = ["active", "suspended", "disabled"];
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;

export interface Affiliate {
  id: string;
  user_id: string;
  centralis_affiliate_id: string;
  code: string;
  commission_rate_reference: string | null;
  attribution_window_days: number;
  status: AffiliateStatus;
  created_at: Date;
  updated_at: Date;
}

/** Codes are case-insensitive and stored uppercase: JOAO, MARIA_2, ANA-SP. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code) ? code : null;
}

export async function findAffiliateByUser(db: Db, userId: string): Promise<Affiliate | null> {
  const [a] = await db.query<Affiliate>(`select * from lastro.affiliates where user_id = $1`, [userId]);
  return a ?? null;
}

export async function findAffiliateByCentralisId(db: Db, centralisId: string): Promise<Affiliate | null> {
  const [a] = await db.query<Affiliate>(`select * from lastro.affiliates where centralis_affiliate_id = $1`, [centralisId]);
  return a ?? null;
}

export async function findAffiliateByCode(db: Db, code: string): Promise<Affiliate | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  const [a] = await db.query<Affiliate>(`select * from lastro.affiliates where code = $1`, [c]);
  return a ?? null;
}

export interface AffiliateFields {
  code: string;
  commissionRate: number | null;
  windowDays: number;
  status: AffiliateStatus;
}

export async function insertAffiliate(db: Db, userId: string, centralisId: string, f: AffiliateFields): Promise<Affiliate> {
  const [a] = await db.query<Affiliate>(
    `insert into lastro.affiliates (id, user_id, centralis_affiliate_id, code, commission_rate_reference, attribution_window_days, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [randomUUID(), userId, centralisId, f.code, f.commissionRate, f.windowDays, f.status],
  );
  return a;
}

export async function updateAffiliate(db: Db, id: string, f: Partial<AffiliateFields>): Promise<Affiliate> {
  const [a] = await db.query<Affiliate>(
    `update lastro.affiliates set
        code = coalesce($2, code),
        commission_rate_reference = case when $3::boolean then $4::numeric else commission_rate_reference end,
        attribution_window_days = coalesce($5, attribution_window_days),
        status = coalesce($6, status),
        updated_at = now()
      where id = $1 returning *`,
    [id, f.code ?? null, f.commissionRate !== undefined, f.commissionRate ?? null, f.windowDays ?? null, f.status ?? null],
  );
  return a;
}

/** Commission figures are Centralis's numbers, stored only to render the dashboard. */
export async function upsertCommissionProjection(
  db: Db,
  affiliateId: string,
  p: { generated: number | null; pending: number | null; paid: number | null; currency: string },
) {
  await db.query(
    `insert into lastro.affiliate_stats (affiliate_id, commission_generated_minor, pending_commission_minor, paid_commission_minor, currency, synced_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (affiliate_id) do update set
       commission_generated_minor = excluded.commission_generated_minor,
       pending_commission_minor = excluded.pending_commission_minor,
       paid_commission_minor = excluded.paid_commission_minor,
       currency = excluded.currency, synced_at = now()`,
    [affiliateId, p.generated, p.pending, p.paid, p.currency],
  );
}

export interface AffiliateStats {
  visits: number;
  unique_visitors: number;
  signups: number;
  purchases: number;
  conversion_rate: number | null;
  revenue_generated_minor: number;
  commission_generated_minor: number | null;
  pending_commission_minor: number | null;
  paid_commission_minor: number | null;
  currency: string;
  commission_synced_at: string | null;
}

/** Aggregates only — never who clicked or bought. */
export async function affiliateStats(db: Db, affiliateId: string): Promise<AffiliateStats> {
  const [r] = await db.query<{
    visits: number; unique_visitors: number; signups: number; purchases: number; revenue: number;
    generated: number | null; pending: number | null; paid: number | null; currency: string | null; synced_at: Date | null;
  }>(
    `select
       (select count(*)::int from lastro.affiliate_clicks where affiliate_id = $1) as visits,
       (select count(distinct visitor_id)::int from lastro.affiliate_clicks where affiliate_id = $1) as unique_visitors,
       (select count(*)::int from lastro.users where referred_by_affiliate_id = $1) as signups,
       (select count(*)::int from lastro.charges where affiliate_id = $1 and status = 'approved') as purchases,
       (select coalesce(sum(amount_minor), 0)::int from lastro.charges where affiliate_id = $1 and status = 'approved') as revenue,
       s.commission_generated_minor as generated, s.pending_commission_minor as pending, s.paid_commission_minor as paid,
       s.currency, s.synced_at
     from (select 1) x left join lastro.affiliate_stats s on s.affiliate_id = $1`,
    [affiliateId],
  );
  return {
    visits: r.visits,
    unique_visitors: r.unique_visitors,
    signups: r.signups,
    purchases: r.purchases,
    conversion_rate: r.unique_visitors > 0 ? r.purchases / r.unique_visitors : null,
    revenue_generated_minor: r.revenue,
    commission_generated_minor: r.generated,
    pending_commission_minor: r.pending,
    paid_commission_minor: r.paid,
    currency: r.currency ?? "BRL",
    commission_synced_at: r.synced_at ? new Date(r.synced_at).toISOString() : null,
  };
}

export function affiliateLink(baseUrl: string, code: string) {
  return { query: `${baseUrl}/?ref=${encodeURIComponent(code)}`, short: `${baseUrl}/r/${encodeURIComponent(code)}` };
}
