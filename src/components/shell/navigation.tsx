"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Compass, House, Plus, Sprout, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { lastroScore } from "@/lib/finance";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { LastroMark } from "./LastroMark";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: string[];
}

export const NAV: NavItem[] = [
  { href: "/home", label: "Início", icon: House, match: ["/home"] },
  { href: "/movimentacoes", label: "Movimentos", icon: ArrowLeftRight, match: ["/movimentacoes"] },
  { href: "/planejamento", label: "Planejar", icon: Compass, match: ["/planejamento", "/orcamentos", "/metas", "/reserva"] },
  { href: "/crescer", label: "Crescer", icon: Sprout, match: ["/crescer"] },
  { href: "/perfil", label: "Perfil", icon: UserRound, match: ["/perfil"] },
];

const isActive = (item: NavItem, path: string) => item.match.some((m) => path === m || path.startsWith(`${m}/`));

/* ---------------- Mobile ---------------- */

export function BottomNavigation() {
  const path = usePathname();
  const { openComposer } = useUI();
  return (
    <>
      <button
        onClick={() => openComposer({ type: "expense" })}
        className="pressable fixed right-4 z-40 grid size-[60px] place-items-center rounded-full bg-green text-ink shadow-[0_12px_32px_-8px_rgba(0,217,155,0.55)] lg:hidden"
        style={{ bottom: "calc(max(12px, var(--safe-bottom)) + 76px)" }}
        aria-label="Registrar gasto"
      >
        <Plus className="size-7" strokeWidth={2.4} />
      </button>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,var(--safe-bottom))] lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-between rounded-[26px] border border-white/[0.07] bg-[#0d1014]/85 p-1.5 shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          {NAV.map((item) => {
            const active = isActive(item, path);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-medium transition-colors",
                  active ? "text-off" : "text-muted hover:text-soft",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-0 rounded-[20px] bg-white/[0.07]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="relative size-[21px]" strokeWidth={active ? 2.3 : 1.9} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/* ---------------- Desktop ---------------- */

export function SideNavigation() {
  const path = usePathname();
  const { openComposer } = useUI();
  const { state, today } = useFinance();
  const { score } = lastroScore(state, today);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.05] bg-ink/60 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/home" className="mb-8 flex items-center gap-2.5 px-3" aria-label="Lastro — início">
        <LastroMark size={28} />
        <span className="font-display text-[21px] font-semibold tracking-[-0.03em]">lastro</span>
      </Link>

      <button
        onClick={() => openComposer({ type: "expense" })}
        className="pressable mb-6 flex h-12 items-center justify-between rounded-[16px] bg-green px-4 text-[15px] font-semibold text-ink hover:bg-green-light"
      >
        <span className="flex items-center gap-2">
          <Plus className="size-5" strokeWidth={2.4} />
          Registrar gasto
        </span>
        <kbd className="rounded-md bg-black/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold">N</kbd>
      </button>

      <nav aria-label="Navegação principal" className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(item, path);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium transition-colors",
                active ? "text-off" : "text-muted hover:bg-white/[0.03] hover:text-soft",
              )}
            >
              {active && (
                <motion.span
                  layoutId="side-nav-active"
                  className="absolute inset-0 rounded-[14px] bg-white/[0.06]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className="relative size-5" strokeWidth={active ? 2.2 : 1.9} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {isActive(NAV[2], path) && (
        <div className="mt-2 ml-6 flex flex-col gap-0.5 border-l border-white/[0.06] pl-3">
          {[
            ["/orcamentos", "Orçamentos"],
            ["/metas", "Metas"],
            ["/reserva", "Reserva"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={cn("rounded-lg px-2 py-1.5 text-[14px]", path === href ? "text-off" : "text-muted hover:text-soft")}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      <Link href="/home#lastro" className="card mt-auto flex items-center gap-3 p-3.5 hover:bg-surface-2">
        <LastroMark size={34} progress={score / 100} />
        <div>
          <p className="eyebrow !text-[10px]">Seu Lastro</p>
          <p className="font-display text-[20px] font-semibold leading-tight tabular">{score}</p>
        </div>
      </Link>
    </aside>
  );
}
