import { NextResponse } from "next/server";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { deferCheckout } from "@/server/payments/checkout.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/checkout/defer — "Pagar depois". No order, no charge, nothing sent to Centralis. */
export async function POST() {
  const { db, user } = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  await deferCheckout(db, user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
