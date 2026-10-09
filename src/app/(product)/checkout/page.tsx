import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Script from "next/script";
import { viewerAccess } from "@/server/access/viewer.ts";
import { CheckoutScreen } from "@/components/product/checkout/CheckoutScreen";
import { AUTH_ROUTES, CHECKOUT_ROUTE } from "@/config/routes";
import { isPlanId } from "@/config/plans";

export const metadata: Metadata = { title: "Escolha seu plano", robots: { index: false, follow: false } };

/**
 * /checkout — authenticated. Without a session the visitor creates an account (or signs in)
 * and comes back here; only this fixed internal destination is ever carried.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const plano = typeof params.plano === "string" && isPlanId(params.plano) ? params.plano : null;
  const pedido = typeof params.pedido === "string" && /^[0-9a-f-]{36}$/i.test(params.pedido) ? params.pedido : null;
  const viewer = await viewerAccess();
  if (!viewer) redirect(`${AUTH_ROUTES.cadastro}?next=${encodeURIComponent(CHECKOUT_ROUTE)}${plano ? `&plano=${plano}` : ""}`);
  return (
    <>
      {/* Mercado Pago's device fingerprint, started as soon as the checkout opens (its anti-fraud
          review weighs it heavily); the card form also loads it if this one was skipped. */}
      <Script id="mp-security" src="https://www.mercadopago.com/v2/security.js" strategy="afterInteractive" {...{ view: "checkout" }} />
      <CheckoutScreen initialPlan={plano} orderId={pedido} />
    </>
  );
}
