import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig } from "@/server/env.ts";
import { readJson } from "@/server/http.ts";
import { authorizeOperator, scheduleDrain } from "@/server/centralis/runtime.ts";
import { confirmManually } from "@/server/payments/checkout.ts";
import { providerById } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payments/confirm  (Authorization: Bearer $CRON_SECRET)
 * { order_id, transaction_id, amount: "19.90" }
 *
 * For a person who checked in the gateway's own panel that a charge was paid but its
 * notification never reached Lastro (gateways without a status query, e.g. Simplify). The
 * charge id and the amount must be exactly the order's; the purchase then follows the normal
 * path (access, Centralis). Never available for gateways Lastro can ask itself.
 */
export async function POST(req: Request) {
  if (!authorizeOperator(req, new URL(req.url).pathname)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await readJson(req);
  const amount = typeof body.amount === "string" || typeof body.amount === "number" ? String(body.amount).trim().replace(",", ".") : "";
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return NextResponse.json({ error: "invalid_amount" }, { status: 422 });
  const r = await confirmManually(
    await getDb(),
    centralisConfig(),
    { orderId: typeof body.order_id === "string" ? body.order_id.trim() : "", transactionId: typeof body.transaction_id === "string" ? body.transaction_id.trim() : "", amountMinor: Math.round(Number(amount) * 100) },
    providerById,
  );
  console.info(JSON.stringify({ scope: "payments", level: "info", message: "manual confirmation", order_id: body.order_id ?? null, ok: r.ok, ...(r.ok ? { result: r.result } : { error: r.error }) }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 409 });
  scheduleDrain();
  return NextResponse.json({ ok: true, result: r.result });
}
