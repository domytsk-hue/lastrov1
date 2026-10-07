"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { TransactionComposer } from "@/components/product/transactions/TransactionComposer";
import { MilestoneHost } from "@/components/product/goals/MilestoneHost";
import { spring } from "@/design-system/motion";
import { useAuth } from "@/auth/auth-store";
import { AUTH_ROUTES, CHECKOUT_ROUTE, ROUTES } from "@/config/routes";
import type { AccessSummary } from "@/config/access";
import { AccessProvider, isLocked } from "@/components/product/access/access-context";
import { FinanceProvider } from "@/product/store/finance-store";
import { UIProvider, useUI } from "@/product/store/ui-store";
import { FlowLayer } from "./FlowLayer";
import { LastroLoader } from "@/components/shared/brand/LastroMark";
import { FloatingNavDesktop, FloatingNavMobile } from "./navigation";

/**
 * <ProductShell /> — the authenticated application frame, used only by app/(product)/app/layout.
 *
 * Route protection: no session → /login (financial data lives on the device, so this runs on
 * the client). Plan access comes from the server (`access`, computed by the layout) and each
 * paid page re-checks it on its own request; here it only decides navigation and whether the
 * money tools (composer, flows, milestones) are mounted at all.
 */
export function ProductShell({ children, access }: { children: React.ReactNode; access: AccessSummary | null }) {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // A server account the server says has access; the demo has no server account.
  const serverAccess = session && !session.demo ? access : null;
  const locked = isLocked(serverAccess);
  // New account without a plan goes through checkout first ("Pagar depois" lets them in).
  const needsCheckout = locked && !!serverAccess && !serverAccess.deferred && pathname !== ROUTES.perfil;

  useEffect(() => {
    if (session === null) router.replace(AUTH_ROUTES.login);
    else if (needsCheckout) router.replace(CHECKOUT_ROUTE);
  }, [session, needsCheckout, router]);

  if (!session || needsCheckout) return <LastroLoader />;

  return (
    <AccessProvider value={serverAccess}>
    <FinanceProvider key={session.userId} userId={session.userId} name={session.name} fallback={<LastroLoader />}>
      <UIProvider composerEnabled={!locked}>
        <a href="#conteudo" className="sr-only z-[90] rounded-xl bg-midnight px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Pular para o conteúdo
        </a>
        <FloatingNavDesktop locked={locked} />
        <Stage>{children}</Stage>
        <FloatingNavMobile locked={locked} />
        {!locked && (
          <>
            <TransactionComposer />
            <FlowLayer />
            <MilestoneHost />
          </>
        )}
      </UIProvider>
    </FinanceProvider>
    </AccessProvider>
  );
}

/** The app recedes (scales back) while the composer floats above it. */
function Stage({ children }: { children: React.ReactNode }) {
  const { composer } = useUI();
  const reduce = useReducedMotion();
  const open = !!composer;
  return (
    <motion.main
      id="conteudo"
      className="relative z-10 origin-top"
      animate={reduce ? undefined : { scale: open ? 0.965 : 1, borderRadius: open ? 36 : 0 }}
      transition={spring.sheet}
    >
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(18px,env(safe-area-inset-top))] pb-[calc(120px+var(--safe-bottom))] sm:px-6 lg:max-w-[1120px] lg:px-10 lg:pt-32 lg:pb-20">
        {children}
      </div>
    </motion.main>
  );
}
