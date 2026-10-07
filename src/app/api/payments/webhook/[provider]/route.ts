import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { handlePaymentEvent } from "@/server/payments/orders.ts";
import { getPaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/payments/webhook/:provider — the only door through which a payment becomes real. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = getPaymentProvider(id);
  if (!provider) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  const raw = await req.text();
  const events = await provider.parseWebhook(raw, req.headers);
  if (!events) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const db = await getDb();
  const config = centralisConfig();
  const results = [];
  for (const ev of events) results.push(await handlePaymentEvent(db, config, provider.id, ev));
  scheduleDrain();
  return NextResponse.json({ received: true, results });
}
