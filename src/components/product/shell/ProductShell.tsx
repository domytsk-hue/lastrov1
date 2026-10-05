"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TransactionComposer } from "@/components/product/transactions/TransactionComposer";
import { MilestoneHost } from "@/components/product/goals/MilestoneHost";
import { spring } from "@/design-system/motion";
import { useAuth } from "@/auth/auth-store";
import { AUTH_ROUTES } from "@/config/routes";
import { FinanceProvider } from "@/product/store/finance-store";
import { UIProvider, useUI } from "@/product/store/ui-store";
import { FlowLayer } from "./FlowLayer";
import { LastroLoader } from "@/components/shared/brand/LastroMark";
import { FloatingNavDesktop, FloatingNavMobile } from "./navigation";

/**
 * <ProductShell /> — the authenticated application frame, used only by app/(product)/app/layout.
 *
 * Route protection: sessions currently live on the device (localStorage), so the check runs on
 * the client. When sessions move to a server cookie, this is the seam to replace with middleware.
 */
export function ProductShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace(AUTH_ROUTES.login);
  }, [session, router]);

  if (!session) return <LastroLoader />;

  return (
    <FinanceProvider key={session.userId} userId={session.userId} name={session.name} fallback={<LastroLoader />}>
      <UIProvider>
        <a href="#conteudo" className="sr-only z-[90] rounded-xl bg-midnight px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Pular para o conteúdo
        </a>
        <FloatingNavDesktop />
        <Stage>{children}</Stage>
        <FloatingNavMobile />
        <TransactionComposer />
        <FlowLayer />
        <MilestoneHost />
      </UIProvider>
    </FinanceProvider>
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
