import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readCookie, readJson, setCookie } from "@/server/http.ts";
import { ensureSession, ensureVisitor, recordAffiliateClick, recordPageView, SESSION_IDLE_MINUTES } from "@/server/tracking/service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/track — first-party, fire-and-forget. Keeps the anonymous visitor/session ids
 * (httpOnly cookies) and records page views and affiliate landings (?ref=CODE).
 */
export async function POST(req: Request) {
  try {
    return await track(req);
  } catch (e) {
    // Analytics is best effort: a busy database loses one page view, never the page.
    console.warn(JSON.stringify({ scope: "tracking", level: "warn", message: "page view not recorded", reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" }));
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}

async function track(req: Request) {
  const body = await readJson(req, 4 * 1024);
  const config = centralisConfig();
  const db = await getDb();
  const { visitorId } = await ensureVisitor(db, await readCookie(COOKIES.visitor));
  const { sessionId } = await ensureSession(db, config, visitorId, await readCookie(COOKIES.visitorSession));
  await setCookie(COOKIES.visitor, visitorId, 400 * 86_400);
  await setCookie(COOKIES.visitorSession, sessionId, SESSION_IDLE_MINUTES * 60);

  if (typeof body.ref === "string") {
    const utm = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
    await recordAffiliateClick(db, config, visitorId, sessionId, { code: body.ref, landingPage: body.path, referrer: body.referrer, utm });
  } else {
    await recordPageView(db, config, visitorId, sessionId, body.path);
  }
  scheduleDrain();
  // No body: the tracker never reads one, and an unread body keeps the request open.
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}
