import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { outboxHealth } from "@/server/centralis/outbox.ts";
import { authorizeOperator } from "@/server/centralis/runtime.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — integration status for Centralis (signed) or operators (Bearer CRON_SECRET). */
export async function GET(req: Request) {
  if (!authorizeOperator(req, new URL(req.url).pathname)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const config = centralisConfig();
  const db = await getDb();
  const [sync] = await db.query<{ value: Record<string, unknown> }>(`select value from lastro.integration_state where key = 'initial_user_sync'`);
  return NextResponse.json({
    enabled: config.enabled,
    configured: Boolean(config.apiUrl && config.apiKey && config.productId && config.webhookSecret),
    product_id: config.productId || null,
    schema_version: config.schemaVersion,
    initial_user_sync: sync?.value ?? null,
    outbox: await outboxHealth(db),
  });
}
