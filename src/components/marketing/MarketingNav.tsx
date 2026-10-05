"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-store";
import { cn } from "@/lib/cn";
import { AUTH_ROUTES, MARKETING_ROUTES } from "@/config/routes";
import { spring } from "@/design-system/motion";
import { LastroMark } from "@/components/shared/brand/LastroMark";
import { PrimaryCta } from "./ui";

export const MARKETING_SECTIONS = [
  { href: "/#produto", label: "Produto" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#recursos", label: "Recursos" },
  { href: "/#planos", label: "Planos" },
];

/**
 * The public site's floating capsule — the same shape language as the product's navigation.
 * On scroll it tightens, becomes more opaque and blurs a little more.
 */
export function MarketingNav() {
  const { session } = useAuth();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-4">
      <nav
        aria-label="Navegação do site"
        className={cn(
          "pointer-events-auto flex w-full items-center justify-between rounded-full transition-all duration-300 ease-[var(--ease-lastro)]",
          scrolled
            ? "max-w-[1040px] bg-white/85 py-1.5 pr-1.5 pl-3 shadow-[0_18px_50px_-22px_rgba(22,80,180,0.5),inset_0_1px_0_#fff] backdrop-blur-xl"
            : "max-w-[1120px] bg-white/40 py-2.5 pr-2.5 pl-4 backdrop-blur-md",
        )}
      >
        <Link href={MARKETING_ROUTES.home} className="flex items-center gap-2 rounded-full pr-2" aria-label="Lastro — página inicial">
          <LastroMark size={28} />
          <span className="font-display text-[21px] font-semibold tracking-[-0.03em] text-ink-900">lastro</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {MARKETING_SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-medium text-ink-700 transition-colors hover:bg-white/80 hover:text-ink-900">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5">
          {!session && (
            <Link href={AUTH_ROUTES.login} className="hidden h-11 items-center rounded-full px-4 text-[15px] font-semibold text-ink-900 hover:bg-white/70 sm:inline-flex">
              Entrar
            </Link>
          )}
          <PrimaryCta size="md" label="Começar agora" />
          <button
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-full text-ink-900 hover:bg-white/70 lg:hidden"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            aria-controls="menu-site"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="menu-site"
            className="pointer-events-auto absolute inset-x-3 top-[76px] rounded-[32px] bg-white/95 p-3 shadow-[0_30px_60px_-24px_rgba(22,80,180,0.55)] backdrop-blur-xl lg:hidden"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.snappy}
          >
            <ul className="flex flex-col">
              {MARKETING_SECTIONS.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} onClick={() => setOpen(false)} className="flex h-14 items-center rounded-[22px] px-5 font-display text-[20px] font-semibold text-ink-900 hover:bg-ice/50">
                    {s.label}
                  </Link>
                </li>
              ))}
              {!session && (
                <li>
                  <Link href={AUTH_ROUTES.login} onClick={() => setOpen(false)} className="flex h-14 items-center rounded-[22px] px-5 font-display text-[20px] font-semibold text-ink-500 hover:bg-ice/50">
                    Entrar
                  </Link>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
