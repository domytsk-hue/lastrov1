"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { TransactionComposer } from "@/components/transactions/TransactionComposer";
import { MilestoneHost } from "@/components/goals/MilestoneHost";
import { spring } from "@/lib/motion";
import { AuthProvider, useAuth } from "@/store/auth-store";
import { FinanceProvider } from "@/store/finance-store";
import { UIProvider, useUI } from "@/store/ui-store";
import { FlowLayer } from "./FlowLayer";
import { LastroLoader } from "./LastroMark";
import { FloatingNavDesktop, FloatingNavMobile } from "./navigation";

export const AUTH_ROUTE = "/entrar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate>{children}</AuthGate>
      </ToastProvider>
    </AuthProvider>
  );
}

/** Signed out → only the auth screen. Signed in → the app, with that person's own data. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onAuthRoute = pathname === AUTH_ROUTE;

  useEffect(() => {
    if (session === undefined) return;
    if (!session && !onAuthRoute) router.replace(AUTH_ROUTE);
    if (session && onAuthRoute) router.replace("/home");
  }, [session, onAuthRoute, router]);

  if (session === undefined) return <LastroLoader />;
  if (onAuthRoute) return session ? <LastroLoader /> : <>{children}</>;
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
