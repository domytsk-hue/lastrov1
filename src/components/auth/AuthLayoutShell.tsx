"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!session) return;
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
  }, [session, router]);

  // The form shows at once (also while the saved session is still being read): only someone
  // actually signed in sees the loader while being sent on.
  if (session) return <LastroLoader />;
  return <>{children}</>;
}
