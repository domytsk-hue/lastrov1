"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/auth/auth-store";
import { ROUTES } from "@/config/routes";
import { LastroLoader } from "@/components/shared/brand/LastroMark";

/** Public auth pages. Someone already signed in goes straight to the product. */
export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace(ROUTES.home);
  }, [session, router]);

  if (session !== null) return <LastroLoader />;
  return <>{children}</>;
}
