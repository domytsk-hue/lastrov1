import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { siteUrl } from "@/server/env.ts";
import { userForSessionToken } from "@/server/auth/accounts.ts";
import { myAffiliate } from "@/server/affiliates/me.ts";
import { COOKIES, readCookie } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/affiliate — `{ affiliate: null }` for everyone who isn't an active affiliate. */
export async function GET() {
  const db = await getDb();
  const user = await userForSessionToken(db, await readCookie(COOKIES.session));
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ affiliate: await myAffiliate(db, user.id, siteUrl()) }, { headers: { "cache-control": "private, no-store" } });
}
