import { NextResponse } from "next/server";
import { centralisConfig } from "@/server/env.ts";
import { getAccess } from "@/server/access/entitlements.ts";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { orderStatus } from "@/server/payments/checkout.ts";
import { providerById } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/checkout/orders/:id — status of one of MY orders, plus my access right now. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user } = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const status = await orderStatus(db, centralisConfig(), user.id, id, providerById);
  if (!status) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
  if (status.status === "approved") scheduleDrain();
  const access = await getAccess(db, user.id);
  return NextResponse.json({ ok: true, order: status, access: { active: access.active, state: access.state, planId: access.planId } }, { headers: NO_STORE });
}
