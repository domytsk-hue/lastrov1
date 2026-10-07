"use client";

import { AuthProvider } from "@/auth/auth-store";
import { ToastProvider } from "@/components/shared/ui/Toast";
import { Tracker } from "./tracker";

/**
 * Cross-cutting providers for every experience. Deliberately light: the session (so the
 * marketing nav can say "Abrir o Lastro" and the auth → product hand-off keeps its toast)
 * and toasts, plus the first-party tracker (page views, affiliate ?ref= landings).
 * Financial state is NOT here — it lives in the product layout.
 */
export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Tracker />
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
