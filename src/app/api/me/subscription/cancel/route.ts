import { NextResponse } from "next/server";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { requestRenewalCancellation } from "@/server/payments/checkout.ts";
import { activePaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/subscription/cancel — stop renewing MY monthly plan. The paid period is kept.
 * Only reported as done once the gateway confirmed it.
 */
export async function POST() {
  const { db, user } = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const r = await requestRenewalCancellation(db, user.id, activePaymentProvider());
  const status = r.ok ? 200 : r.error === "no_subscription" ? 404 : r.error === "not_supported" ? 501 : 502;
  return NextResponse.json(r, { status, headers: NO_STORE });
}
