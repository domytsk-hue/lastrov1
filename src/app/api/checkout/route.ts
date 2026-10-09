import { NextResponse } from "next/server";
import { centralisConfig, siteUrl } from "@/server/env.ts";
import { getAccess } from "@/server/access/entitlements.ts";
import { currentUser, NO_STORE } from "@/server/access/viewer.ts";
import { scheduleDrain } from "@/server/centralis/runtime.ts";
import { COOKIES, readCookie, readJson } from "@/server/http.ts";
import { attachCheckout, billingFieldsOf, createOrder, validateBilling } from "@/server/payments/checkout.ts";
import { parseCardInput } from "@/server/payments/mercadopago.ts";
import type { PaymentMethod } from "@/server/payments/provider.ts";
import { checkoutProviders, providerForMethod } from "@/server/payments/registry.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** https origin of this request (the host the buyer is on); NEXT_PUBLIC_SITE_URL otherwise. */
function publicOrigin(req: Request): string {
  const u = new URL(req.url);
  return u.protocol === "https:" && !/^(localhost|127\.|\[::1\])/.test(u.hostname) ? u.origin : siteUrl();
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** GET /api/checkout — what the checkout page needs: the account, its access, the gateways. */
export async function GET() {
  const { db, user } = await currentUser();
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);
  const offered = checkoutProviders();
  const card = offered.find((o) => o.method === "card")?.provider ?? null;
  return json({
    ok: true,
    account: { name: user.name, email: user.email, phone: user.phone },
    access: await getAccess(db, user.id),
    payments: {
      available: offered.length > 0,
      methods: offered.map((o) => o.method),
      // Automatic monthly renewal exists only on a card gateway that manages subscriptions.
      recurring: card?.supportsSubscriptions ?? false,
      hosted: false,
      autoRenews: offered.some((o) => o.provider.autoRenews),
      name: null,
      // The billing fields each method's gateway needs from Lastro.
      fields: Object.fromEntries(offered.map((o) => [o.method, billingFieldsOf(o.provider)])),
      // The card gateway's script tokenizes the card in the browser (public key only).
      card: card ? { gateway: card.id, publicKey: card.publicKey ?? null } : null,
    },
  });
}

/**
 * POST /api/checkout { plan_id, method, name, cpf, phone, email?, idempotency_key, card? }
 * `card` is { token, payment_method_id, issuer_id } from the card gateway's own script — never
 * the card number or CVV.
 * Opens (or finds) the charge for the signed-in user. Only creates a PENDING order: access
 * is released exclusively by the gateway's verified confirmation. Any amount the browser
 * sends is ignored — the price comes from the plan catalog.
 */
export async function POST(req: Request) {
  const { db, user } = await currentUser();
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);
  // No gateway at all: refuse before storing anything (no order, no billing data, no event).
  if (!checkoutProviders().length) return json({ ok: false, error: "payments_unavailable" }, 503);

  const body = await readJson(req);
  const method = body.method === "pix" || body.method === "card" ? (body.method as PaymentMethod) : null;
  const provider = method ? providerForMethod(method) : null;
  if (!method || !provider) return json({ ok: false, error: "invalid_method" }, 422);

  // Only the fields this method's gateway needs from Lastro.
  const fields = billingFieldsOf(provider);
  const billing = fields.length ? validateBilling({ name: body.name, cpf: body.cpf, phone: body.phone, email: body.email }, user.email, fields) : null;
  if (billing && !billing.ok) return json({ ok: false, error: "invalid_billing", fields: billing.errors }, 422);
  // Card on a gateway with browser tokenization needs the token before anything is stored.
  const card = method === "card" && provider.publicKey ? parseCardInput(body.card) : null;
  if (method === "card" && provider.publicKey && !card) return json({ ok: false, error: "invalid_card" }, 422);

  const config = centralisConfig();
  const created = await createOrder(db, config, {
    userId: user.id,
    planId: typeof body.plan_id === "string" ? body.plan_id : "",
    method,
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
      method,
      customer: billing ? { userId: user.id, ...billing.value } : null,
      card,
      // The address this site is really served on (e.g. with www): gateways send their
      // notifications there and many don't follow a redirect from another host.
      returnUrl: `${publicOrigin(req)}/checkout?pedido=${order.id}`,
    });
    await attachCheckout(db, order.id, result);
    return json({ ok: true, order_id: order.id, status: "pending", instructions: result.instructions, expires_at: result.expiresAt ?? null });
  } catch (e) {
    // For the server log: which gateway, which order and the gateway's own reason (adapters
    // put no card data, tokens or credentials in their errors).
    console.error(JSON.stringify({ scope: "checkout", level: "error", message: "gateway refused or unreachable", provider: provider.id, method, order_id: order.id, reason: e instanceof Error ? e.message.slice(0, 400) : "unknown" }));
    // A timeout is not "no payment": the order stays pending and the same key retries it,
    // with the gateway's idempotency key.
    return json({ ok: false, error: "gateway_error", order_id: order.id }, 502);
  }
}
