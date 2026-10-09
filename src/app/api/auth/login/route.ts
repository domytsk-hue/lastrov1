import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { signIn, SESSION_DAYS } from "@/server/auth/accounts.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readJson, setCookie } from "@/server/http.ts";
import { recoverAffiliateLanding } from "@/server/tracking/recover.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req);
  const db = await getDb();
  const config = centralisConfig();
  const visitorId = await recoverAffiliateLanding(db, config, null);
  const r = await signIn(db, config, { identifier: body.identifier, password: body.password }, { visitorId });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
  await setCookie(COOKIES.session, r.value.token, SESSION_DAYS * 86_400);
  scheduleDrain();
  return NextResponse.json({ ok: true, session: r.value.session });
}
