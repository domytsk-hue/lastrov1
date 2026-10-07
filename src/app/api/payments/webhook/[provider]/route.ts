import { after, NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { processRenewalCancellations } from "@/server/payments/checkout.ts";
import { handlePaymentEvent, RetryLater } from "@/server/payments/orders.ts";
import { getPaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/payments/webhook/:provider — the door through which a payment becomes real. */
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
  for (const ev of events) {
    try {
      results.push(await handlePaymentEvent(db, config, provider.id, ev));
    } catch (e) {
      // Out of order (e.g. refund before its payment): nothing was recorded; the gateway
      // delivers it again later. Events already applied above are idempotent on replay.
      if (e instanceof RetryLater) return NextResponse.json({ error: "retry_later" }, { status: 503 });
      throw e;
    }
  }
  scheduleDrain();
  try {
    after(() => processRenewalCancellations(db, provider).catch(() => undefined));
  } catch {
    /* the scheduled flush retries it */
  }
  return NextResponse.json({ received: true, results });
}
