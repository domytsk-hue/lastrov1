import { NextResponse } from "next/server";
import { centralisConfig, siteUrl } from "@/server/env.ts";
import { getAccess } from "@/server/access/entitlements.ts";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readCookie, readJson } from "@/server/http.ts";
import { attachCheckout, createOrder, validateBilling } from "@/server/payments/checkout.ts";
import { activePaymentProvider } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** GET /api/checkout — what the checkout page needs: the account, its access, the gateway. */
export async function GET() {
  const { db, user } = await currentUser();
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);
  const provider = activePaymentProvider();
  return json({
    ok: true,
    account: { name: user.name, email: user.email, phone: user.phone },
    access: await getAccess(db, user.id),
    payments: {
      available: !!provider,
      methods: provider?.methods ?? [],
      recurring: provider?.supportsSubscriptions ?? false,
      hosted: provider?.hostedCheckout ?? false,
      autoRenews: provider?.autoRenews ?? false,
      name: provider?.id === "kirvano" ? "Kirvano" : null,
    },
  });
}

/**
 * POST /api/checkout { plan_id, method, name, cpf, phone, email?, idempotency_key }
 * (with a hosted checkout such as Kirvano: just { plan_id, idempotency_key })
 * Opens (or finds) the charge for the signed-in user. Only creates a PENDING order: access
 * is released exclusively by the gateway's verified confirmation. Any amount the browser
 * sends is ignored — the price comes from the plan catalog.
 */
export async function POST(req: Request) {
  const { db, user } = await currentUser();
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);
  const provider = activePaymentProvider();
  // No gateway: refuse before storing anything (no order, no billing data, no event).
  if (!provider) return json({ ok: false, error: "payments_unavailable" }, 503);

  const body = await readJson(req);
  // A hosted checkout (Kirvano) collects the billing data on its own page: Lastro asks for none.
  const billing = provider.hostedCheckout ? null : validateBilling({ name: body.name, cpf: body.cpf, phone: body.phone, email: body.email }, user.email);
  if (billing && !billing.ok) return json({ ok: false, error: "invalid_billing", fields: billing.errors }, 422);

  const config = centralisConfig();
  const created = await createOrder(db, config, {
    userId: user.id,
    planId: typeof body.plan_id === "string" ? body.plan_id : "",
    method: typeof body.method === "string" ? body.method : "",
    idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : "",
    visitorId: await readCookie(COOKIES.visitor),
    provider,
  });
  if (!created.ok) return json({ ok: false, error: created.error }, created.error === "plan_not_found" ? 404 : created.error === "invalid_method" ? 422 : 409);
  const { order, plan } = created;
  scheduleDrain();

  // Already has its charge (refresh, double click, second tab): show the same one again.
  if (order.provider_checkout_id && order.payment_instructions) {
    return json({ ok: true, order_id: order.id, status: order.status, instructions: order.payment_instructions, expires_at: order.expires_at });
  }

  try {
    const result = await provider.createCheckout({
      orderId: order.id,
      plan: { id: plan.id, name: plan.name, amountMinor: plan.amount_minor, currency: plan.currency, billing: plan.billing },
      method: order.payment_method,
      customer: billing ? { userId: user.id, ...billing.value } : null,
      returnUrl: `${siteUrl()}/checkout?pedido=${order.id}`,
    });
    await attachCheckout(db, order.id, result);
    return json({ ok: true, order_id: order.id, status: "pending", instructions: result.instructions, expires_at: result.expiresAt ?? null });
  } catch {
    // A timeout is not "no payment": the order stays pending and the same key retries it,
    // with the order id as the gateway's idempotency key.
    return json({ ok: false, error: "gateway_error", order_id: order.id }, 502);
  }
}
