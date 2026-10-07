import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { handleCentralisAction } from "@/server/centralis/actions.ts";
import { centralisLog } from "@/server/centralis/log.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { verifyRequest } from "@/server/centralis/signature.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

/** POST /api/integrations/centralis/actions — signed commands from Centralis. */
export async function POST(req: Request) {
  const config = centralisConfig();
  if (!config.enabled) {
    return NextResponse.json({ success: false, action_id: null, error: { code: "integration_disabled", message: "Centralis integration is disabled." } }, { status: 503 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ success: false, action_id: null, error: { code: "payload_too_large", message: "Body too large." } }, { status: 413 });
  }
  const check = verifyRequest(
    config.webhookSecret,
    { timestamp: req.headers.get("x-centralis-timestamp"), signature: req.headers.get("x-centralis-signature") },
    "POST",
    new URL(req.url).pathname,
    raw,
  );
  if (!check.ok) {
    centralisLog("warn", "rejected unsigned or invalid command", { code: check.code });
    return NextResponse.json({ success: false, action_id: null, error: { code: check.code, message: "Invalid signature." } }, { status: 401 });
  }
  const outcome = await handleCentralisAction(await getDb(), config, raw);
  if (outcome.body.success) scheduleDrain(); // send the confirmation event (affiliate.promoted…) soon
  return NextResponse.json(outcome.body, { status: outcome.status });
}
