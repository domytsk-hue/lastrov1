import { NextResponse } from "next/server";
import { authorizeOperator, drainOutbox } from "@/server/centralis/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drains the outbox. Call it on a schedule (Vercel Cron sends GET with
 * `Authorization: Bearer $CRON_SECRET`; Supabase pg_cron or any scheduler works too).
 */
async function handle(req: Request) {
  if (!authorizeOperator(req, new URL(req.url).pathname)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await drainOutbox());
}

export const GET = handle;
export const POST = handle;
