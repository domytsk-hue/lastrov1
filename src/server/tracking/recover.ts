import "server-only";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { COOKIES, readCookie, setCookie } from "../http.ts";
import { findAffiliateByCode } from "../affiliates/service.ts";
import { latestValidAttribution, linkVisitorToUser } from "./attribution.ts";
import { ensureSession, ensureVisitor, recordAffiliateClick, SESSION_IDLE_MINUTES } from "./service.ts";
import { parseRefCookie } from "./ref-cookie.ts";

/**
 * Makes sure an affiliate landing this browser had is recorded, before something is credited
 * from it (sign-up, login, checkout). The click is normally recorded by the page's tracker; if
 * that never reached the server, it is recorded now, dated when it really happened, so the
 * affiliate's window counts from the real click. A newer click already recorded wins (last
 * click). Never throws: attribution must not break a sign-up or a purchase.
 * Returns the visitor id to use for this request.
 */
export async function recoverAffiliateLanding(db: Db, config: CentralisConfig, userId: string | null, now = new Date()): Promise<string | null> {
  let visitorId = await readCookie(COOKIES.visitor);
  try {
    const ref = parseRefCookie(await readCookie(COOKIES.ref), now.getTime());
    if (!ref) return visitorId;
    const affiliate = await findAffiliateByCode(db, ref.code);
    if (!affiliate || affiliate.status !== "active") return visitorId;
    if (ref.at.getTime() + affiliate.attribution_window_days * 86_400_000 <= now.getTime()) return visitorId;

    const v = await ensureVisitor(db, visitorId);
    if (v.visitorId !== visitorId) {
      visitorId = v.visitorId;
      await setCookie(COOKIES.visitor, visitorId, 400 * 86_400);
    }
    const existing = await latestValidAttribution(db, { visitorId, userId }, now);
    // Recorded already (the tracker worked), or a later click to someone else: nothing to do.
    if (existing && new Date(existing.attributed_at).getTime() >= ref.at.getTime() - 60_000) return visitorId;

    const s = await ensureSession(db, config, visitorId, await readCookie(COOKIES.visitorSession));
    await setCookie(COOKIES.visitorSession, s.sessionId, SESSION_IDLE_MINUTES * 60);
    await recordAffiliateClick(db, config, visitorId, s.sessionId, { code: ref.code, landingPage: "/", referrer: null, utm: {} }, ref.at);
    if (userId) await linkVisitorToUser(db, visitorId, userId);
    console.info(JSON.stringify({ scope: "tracking", level: "info", message: "affiliate landing recovered", code: ref.code }));
  } catch (e) {
    console.warn(JSON.stringify({ scope: "tracking", level: "warn", message: "affiliate landing not recovered", reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
  }
  return visitorId;
}
