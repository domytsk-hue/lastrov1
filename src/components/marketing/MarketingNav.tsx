"use client";

import Link from "next/link";
import { useAuth } from "@/auth/auth-store";
import { AUTH_ROUTES, MARKETING_ROUTES, ROUTES } from "@/config/routes";
import { LastroMark } from "@/components/shared/brand/LastroMark";

/** Public site navigation. Knows only whether there is a session — never any financial state. */
export function MarketingNav() {
  const { session } = useAuth();
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
      <Link href={MARKETING_ROUTES.home} className="flex items-center gap-2.5" aria-label="Lastro">
        <LastroMark size={30} />
        <span className="font-display text-[22px] font-semibold tracking-[-0.03em]">lastro</span>
      </Link>
      <nav aria-label="Navegação do site" className="flex items-center gap-2">
        {session ? (
          <Link href={ROUTES.home} className="inline-flex h-11 items-center rounded-full bg-midnight px-5 text-[15px] font-semibold text-white">
            Abrir o Lastro
          </Link>
        ) : (
          <>
            <Link href={AUTH_ROUTES.login} className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold text-ink-900 hover:bg-white/60">
              Entrar
            </Link>
            <Link href={AUTH_ROUTES.cadastro} className="inline-flex h-11 items-center rounded-full bg-midnight px-5 text-[15px] font-semibold text-white">
              Criar conta
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
