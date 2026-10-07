import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { siteUrl } from "@/server/env.ts";
import { userForSessionToken } from "@/server/auth/accounts.ts";
import { myAffiliate } from "@/server/affiliates/me.ts";
import { COOKIES, readCookie } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/affiliate/stats — aggregated numbers only; 404 when not an active affiliate. */
export async function GET() {
  const db = await getDb();
  const user = await userForSessionToken(db, await readCookie(COOKIES.session));
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const me = await myAffiliate(db, user.id, siteUrl());
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ stats: me.stats }, { headers: { "cache-control": "private, no-store" } });
}
