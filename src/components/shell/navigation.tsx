"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Compass, House, Plus, Sprout, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { TactileButton } from "@/components/surfaces/Surface";
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
];
const PROFILE: NavItem = { href: "/perfil", label: "Perfil", icon: UserRound, match: ["/perfil"] };

const isActive = (item: NavItem, path: string) => item.match.some((m) => path === m || path.startsWith(`${m}/`));

/** Icon when idle; expands into a pill with its label when selected. The pill slides between items. */
function NavPill({ item, active, layoutId, dark }: { item: NavItem; active: boolean; layoutId: string; dark?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "relative flex h-12 min-w-12 items-center justify-center gap-2 rounded-full px-3 text-[14px] font-semibold transition-colors",
        active ? (dark ? "text-midnight" : "text-white") : dark ? "text-white/65 hover:text-white" : "text-ink-500 hover:text-ink-900",
      )}
    >
      {active && <motion.span layoutId={layoutId} className={cn("absolute inset-0 rounded-full", dark ? "bg-white" : "bg-midnight")} transition={spring.snappy} />}
      <motion.span className="relative" animate={{ scale: active ? 1 : 0.94 }} transition={spring.snappy}>
        <Icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.9} />
      </motion.span>
      {active && (
        <motion.span className="relative whitespace-nowrap" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.snappy, delay: 0.05 }}>
          {item.label}
        </motion.span>
      )}
    </Link>
  );
}

/** Desktop: a thin floating capsule at the top. No sidebar. */
export function FloatingNavDesktop() {
  const path = usePathname();
  const { openComposer } = useUI();
  const { state } = useFinance();
  const profileActive = isActive(PROFILE, path);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-5 z-40 hidden justify-center lg:flex">
      <nav
        aria-label="Navegação principal"
        className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/70 p-1.5 shadow-[0_18px_50px_-20px_rgba(22,80,180,0.45),inset_0_1px_0_#fff] backdrop-blur-xl"
      >
        <Link href="/home" className="grid size-12 place-items-center rounded-full" aria-label="Lastro — início">
          <LastroMark size={26} tone="dark" />
        </Link>
        <span className="mx-1 h-6 w-px bg-ink-900/10" aria-hidden />
        {NAV.map((item) => (
          <NavPill key={item.href} item={item} active={isActive(item, path)} layoutId="nav-desktop" />
        ))}
        <span className="mx-1 h-6 w-px bg-ink-900/10" aria-hidden />
        <Link
          href="/perfil"
          aria-current={profileActive ? "page" : undefined}
          aria-label="Perfil"
          className={cn(
            "grid size-12 place-items-center rounded-full font-display text-[16px] font-semibold transition-shadow",
            profileActive ? "bg-midnight text-white" : "bg-gradient-to-br from-sky to-electric text-white",
          )}
        >
          {state.user.name.charAt(0)}
        </Link>
        <TactileButton
          magnetic
          onClick={() => openComposer({ type: "expense" })}
          className="ml-1 flex h-12 items-center gap-2 rounded-full bg-mint pr-5 pl-4 text-[15px] font-semibold text-midnight shadow-[0_10px_24px_-10px_rgba(24,224,174,0.9)]"
        >
          <Plus className="size-5" strokeWidth={2.5} />
          Gasto
          <kbd className="ml-1 rounded-md bg-midnight/10 px-1.5 font-sans text-[11px]">N</kbd>
        </TactileButton>
      </nav>
    </header>
  );
}

/** Mobile: a native-feeling floating capsule + a separate green orb for the main action. */
export function FloatingNavMobile() {
  const path = usePathname();
  const { openComposer } = useUI();
  // Perfil lives behind the avatar on mobile, so the capsule stays thumb-sized.
  const items = NAV;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-center gap-2.5 px-3 pb-[max(12px,var(--safe-bottom))] lg:hidden">
      <nav
        aria-label="Navegação principal"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-midnight/92 p-1.5 shadow-[0_20px_44px_-16px_rgba(7,26,59,0.75),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"
      >
        {items.map((item) => (
          <NavPill key={item.href} item={item} active={isActive(item, path)} layoutId="nav-mobile" dark />
        ))}
      </nav>
      <TactileButton
        onClick={() => openComposer({ type: "expense" })}
        className="pointer-events-auto grid size-[60px] shrink-0 place-items-center rounded-full bg-mint text-midnight shadow-[0_14px_30px_-10px_rgba(24,224,174,0.95),inset_0_1px_0_rgba(255,255,255,0.5)]"
        aria-label="Registrar gasto"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </TactileButton>
    </div>
  );
}
