"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { TransactionComposer } from "@/components/transactions/TransactionComposer";
import { MilestoneHost } from "@/components/goals/MilestoneHost";
import { FinanceProvider } from "@/store/finance-store";
import { UIProvider } from "@/store/ui-store";
import { LastroLoader } from "./LastroMark";
import { BottomNavigation, SideNavigation } from "./navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider fallback={<LastroLoader />}>
      <UIProvider>
        <ToastProvider>
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
        </ToastProvider>
      </UIProvider>
    </FinanceProvider>
  );
}
