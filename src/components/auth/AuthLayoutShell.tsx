"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/auth-store";
import { CHECKOUT_ROUTE, ROUTES, safeNext } from "@/config/routes";
import { isPlanId } from "@/config/plans";
import { LastroLoader } from "@/components/shared/brand/LastroMark";

/**
 * Public auth pages. Someone already signed in moves on:
 *  - to the checkout when they asked for it (?next=/checkout) or when the paywall is on and
 *    their account has no access yet (and they haven't chosen "Pagar depois");
 *  - to the product otherwise.
 * Access comes from the server; this only picks the next screen.
 */
export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const router = useRouter();
  // Arriving here from the demo (e.g. a plan button on the landing) means "create my account":
  // the demo is left so the form shows. Choosing the demo ON this page still opens it.
  const arrived = useRef(false);

  useEffect(() => {
    if (session === undefined) return;
    const firstLook = !arrived.current;
    arrived.current = true;
    if (!session) return;
    if (session.demo) {
      if (firstLook) signOut();
      else router.replace(ROUTES.home);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    const plano = params.get("plano");
    const checkout = `${CHECKOUT_ROUTE}${isPlanId(plano) ? `?plano=${plano}` : ""}`;
    let alive = true;
    fetch("/api/me/access", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ access?: { paywall: boolean; active: boolean; deferred: boolean } }>) : Promise.reject()))
      .then(({ access }) => {
        if (!alive) return;
        const needsPlan = !!access && access.paywall && !access.active && !access.deferred;
        router.replace(next || needsPlan ? checkout : ROUTES.home);
      })
      .catch(() => alive && router.replace(next ? checkout : ROUTES.home));
    return () => {
      alive = false;
    };
  }, [session, router, signOut]);

  // The form shows at once (also while the saved session is still being read): only someone
  // actually signed in sees the loader while being sent on.
  if (session) return <LastroLoader />;
  return <>{children}</>;
}
