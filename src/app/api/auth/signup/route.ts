import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { signUp, SESSION_DAYS } from "@/server/auth/accounts.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readCookie, readJson, setCookie } from "@/server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req);
  const r = await signUp(await getDb(), centralisConfig(), { name: body.name, email: body.email, phone: body.phone, password: body.password }, { visitorId: await readCookie(COOKIES.visitor) });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await setCookie(COOKIES.session, r.value.token, SESSION_DAYS * 86_400);
  scheduleDrain();
  return NextResponse.json({ ok: true, session: r.value.session });
}
