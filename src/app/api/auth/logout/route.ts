import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { deleteSession } from "@/server/auth/accounts.ts";
import { clearCookie, COOKIES, readCookie } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await deleteSession(await getDb(), await readCookie(COOKIES.session));
  await clearCookie(COOKIES.session);
  return NextResponse.json({ ok: true });
}
