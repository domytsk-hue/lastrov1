import { NextResponse } from "next/server";
import { getDb } from "@/server/db/index.ts";
import { centralisConfig, siteUrl } from "@/server/env.ts";
import { userForSessionToken } from "@/server/auth/accounts.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readCookie, readJson } from "@/server/http.ts";
import { attachCheckout, startCheckout } from "@/server/payments/orders.ts";
import { activePaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout { plan_id } — opens a checkout for the signed-in user. This only creates
 * a pending order: access is released exclusively by the gateway's verified webhook.
 */
export async function POST(req: Request) {
  const db = await getDb();
  const user = await userForSessionToken(db, await readCookie(COOKIES.session));
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const provider = activePaymentProvider();
  if (!provider) return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });

  const body = await readJson(req);
  const planId = typeof body.plan_id === "string" ? body.plan_id : "";
  const started = await startCheckout(db, centralisConfig(), user.id, planId, provider.id, await readCookie(COOKIES.visitor));
  if (!started.ok) return NextResponse.json({ ok: false, error: started.error }, { status: 404 });

  const site = siteUrl();
  const checkout = await provider.createCheckout({
    orderId: started.orderId,
    plan: { id: started.plan.id, name: started.plan.name, amountMinor: started.plan.amount_minor, currency: started.plan.currency, billing: started.plan.billing },
    customer: { userId: user.id, name: user.name, email: user.email, phone: user.phone },
    successUrl: `${site}/app/perfil?pagamento=processando`,
    cancelUrl: `${site}/#planos`,
  });
  await attachCheckout(db, started.orderId, checkout.providerCheckoutId);
  scheduleDrain();
  return NextResponse.json({ ok: true, order_id: started.orderId, checkout_url: checkout.url });
}
