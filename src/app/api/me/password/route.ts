import { NextResponse } from "next/server";
import { NO_STORE } from "@/server/access/viewer.ts";
import { getDb } from "@/server/db/index.ts";
import { changePassword, userForSessionToken } from "@/server/auth/accounts.ts";
import { COOKIES, readCookie, readJson } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/password — { password } becomes MY new password. Being signed in is enough
 * (no old password). Other devices are signed out; this one stays.
 */
export async function POST(req: Request) {
  const db = await getDb();
  const token = await readCookie(COOKIES.session);
  const user = await userForSessionToken(db, token);
  if (!user || !token) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const body = await readJson(req);
  const r = await changePassword(db, user.id, body.password, token);
  return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error }, { status: r.ok ? 200 : 422, headers: NO_STORE });
}
