import { NextResponse } from "next/server";
import { getAccess } from "@/server/access/entitlements.ts";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { activePaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/access — my plan and access, computed on the server (navigation and display). */
export async function GET() {
  const { db, user } = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const provider = activePaymentProvider();
  return NextResponse.json(
    { ok: true, access: await getAccess(db, user.id), payments: { available: !!provider, recurring: provider?.supportsSubscriptions ?? false } },
    { headers: NO_STORE },
  );
}
