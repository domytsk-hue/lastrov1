"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { TransactionComposer } from "@/components/transactions/TransactionComposer";
import { MilestoneHost } from "@/components/goals/MilestoneHost";
import { AuthProvider, useAuth } from "@/store/auth-store";
import { FinanceProvider } from "@/store/finance-store";
import { UIProvider } from "@/store/ui-store";
import { LastroLoader } from "./LastroMark";
import { BottomNavigation, SideNavigation } from "./navigation";

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
        <a
          href="#conteudo"
          className="sr-only z-[90] rounded-xl bg-off px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>
        <SideNavigation />
        <main id="conteudo" className="relative z-10 lg:pl-[248px]">
          <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(120px+var(--safe-bottom))] sm:px-6 lg:max-w-[1180px] lg:px-10 lg:pt-8 lg:pb-16">
            {children}
          </div>
        </main>
        <BottomNavigation />
        <TransactionComposer />
        <MilestoneHost />
      </UIProvider>
    </FinanceProvider>
  );
}
