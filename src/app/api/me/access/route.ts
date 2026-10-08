import { NextResponse } from "next/server";
import { getAccess } from "@/server/access/entitlements.ts";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { checkoutProviders } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/access — my plan and access, computed on the server (navigation and display). */
export async function GET() {
  const { db, user } = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const offered = checkoutProviders().map((o) => o.provider);
  return NextResponse.json(
    { ok: true, access: await getAccess(db, user.id), payments: { available: offered.length > 0, recurring: offered.some((p) => p.supportsSubscriptions), autoRenews: offered.some((p) => p.autoRenews), provider: null } },
    { headers: NO_STORE },
  );
}
