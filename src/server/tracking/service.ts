import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue } from "../centralis/outbox.ts";
import { findAffiliateByCode } from "../affiliates/service.ts";

/**
 * Anonymous visitors (long-lived id), their sessions (30 min of inactivity ends one) and
 * affiliate clicks. A visitor is a browser, not a person: no name, e-mail or phone here.
 */

export const SESSION_IDLE_MINUTES = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const clip = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function ensureVisitor(db: Db, cookieId: string | null | undefined): Promise<{ visitorId: string; isNew: boolean }> {
  if (isUuid(cookieId)) {
    const rows = await db.query(`update lastro.visitors set last_seen_at = now() where id = $1 returning id`, [cookieId]);
    if (rows.length) return { visitorId: cookieId, isNew: false };
  }
  const visitorId = randomUUID();
  await db.query(`insert into lastro.visitors (id) values ($1)`, [visitorId]);
  return { visitorId, isNew: true };
}

export async function ensureSession(db: Db, config: CentralisConfig, visitorId: string, cookieId: string | null | undefined): Promise<{ sessionId: string; isNew: boolean }> {
  if (isUuid(cookieId)) {
    const rows = await db.query(
      `update lastro.visitor_sessions set last_seen_at = now()
        where id = $1 and visitor_id = $2 and last_seen_at > now() - make_interval(mins => $3) returning id`,
      [cookieId, visitorId, SESSION_IDLE_MINUTES],
    );
    if (rows.length) return { sessionId: cookieId, isNew: false };
  }
  const sessionId = randomUUID();
  await db.query(`insert into lastro.visitor_sessions (id, visitor_id) values ($1, $2)`, [sessionId, visitorId]);
  await enqueue(db, config, "session.started", { visitor_id: visitorId, session_id: sessionId });
  return { sessionId, isNew: true };
}

/** Pathname only: query strings can carry things we don't want to keep. */
export function safePath(raw: unknown): string | null {
  const p = clip(raw, 500);
  if (!p || !p.startsWith("/")) return null;
  return p.split(/[?#]/)[0];
}

export async function recordPageView(db: Db, config: CentralisConfig, visitorId: string, sessionId: string, path: unknown) {
  const page = safePath(path);
  if (!page) return;
  await enqueue(db, config, "page_view", { visitor_id: visitorId, session_id: sessionId, page });
}

export interface ClickInput {
  code: unknown;
  landingPage: unknown;
  referrer: unknown;
  utm: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", unknown>>;
}

export type ClickResult = { recorded: true; clickId: string } | { recorded: false; reason: "unknown_code" | "inactive" | "same_session" };

/**
 * A valid ?ref= landing. Counted once per session per affiliate (refreshes and in-session
 * navigation don't inflate visits); each counted click becomes the visitor's latest
 * attribution, expiring after the affiliate's window.
 */
export async function recordAffiliateClick(db: Db, config: CentralisConfig, visitorId: string, sessionId: string, input: ClickInput, now = new Date()): Promise<ClickResult> {
  if (typeof input.code !== "string") return { recorded: false, reason: "unknown_code" };
  const affiliate = await findAffiliateByCode(db, input.code);
  if (!affiliate) return { recorded: false, reason: "unknown_code" };
  if (affiliate.status !== "active") return { recorded: false, reason: "inactive" };

  return db.tx(async (tx) => {
    const clickId = randomUUID();
    const landing = safePath(input.landingPage);
    const rows = await tx.query<{ id: string }>(
      `insert into lastro.affiliate_clicks (id, affiliate_id, affiliate_code, visitor_id, session_id, landing_page, referrer,
                                            utm_source, utm_medium, utm_campaign, utm_term, utm_content, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (affiliate_id, session_id) do nothing returning id`,
      [
        clickId, affiliate.id, affiliate.code, visitorId, sessionId, landing, clip(input.referrer, 500),
        clip(input.utm.source, 200), clip(input.utm.medium, 200), clip(input.utm.campaign, 200), clip(input.utm.term, 200), clip(input.utm.content, 200), now,
      ],
    );
    if (!rows.length) return { recorded: false as const, reason: "same_session" as const };

    const expires = new Date(now.getTime() + affiliate.attribution_window_days * 86_400_000);
    const [link] = await tx.query<{ user_id: string | null }>(`select user_id from lastro.visitors where id = $1`, [visitorId]);
    await tx.query(
      `insert into lastro.attributions (id, visitor_id, user_id, affiliate_id, click_id, attributed_at, expires_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), visitorId, link?.user_id ?? null, affiliate.id, clickId, now, expires],
    );
    const aff = { id: affiliate.centralis_affiliate_id, centralis_affiliate_id: affiliate.centralis_affiliate_id, code: affiliate.code };
    await enqueue(tx, config, "affiliate.click", {
      visitor_id: visitorId,
      session_id: sessionId,
      affiliate: aff,
      landing_page: landing,
      referrer: clip(input.referrer, 500),
      utm: {
        source: clip(input.utm.source, 200), medium: clip(input.utm.medium, 200), campaign: clip(input.utm.campaign, 200),
        term: clip(input.utm.term, 200), content: clip(input.utm.content, 200),
      },
    }, now);
    await enqueue(tx, config, "affiliate.attributed", {
      visitor_id: visitorId,
      affiliate: aff,
      model: "last_click",
      attributed_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }, now);
    return { recorded: true as const, clickId };
  });
}
