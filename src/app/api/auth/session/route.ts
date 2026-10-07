import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { toClientSession, userForSessionToken } from "@/server/auth/accounts.ts";
import { COOKIES, readCookie } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user, from the httpOnly cookie. */
export async function GET() {
  const user = await userForSessionToken(await getDb(), await readCookie(COOKIES.session));
  return NextResponse.json({ session: user ? toClientSession(user) : null }, { headers: { "cache-control": "no-store" } });
}
