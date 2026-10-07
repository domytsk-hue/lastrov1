"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Compass, House, LockOpen, Plus, Sprout, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { spring } from "@/design-system/motion";
import { useFinance } from "@/product/store/finance-store";
import { useUI } from "@/product/store/ui-store";
import { TactileButton } from "@/components/shared/surfaces/Surface";
import { Avatar } from "@/components/shared/ui/Avatar";
import { LastroMark } from "@/components/shared/brand/LastroMark";
import { CHECKOUT_ROUTE, ROUTES } from "@/config/routes";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: string[];
}

export const NAV: NavItem[] = [
  { href: ROUTES.home, label: "Início", icon: House, match: [ROUTES.home] },
  { href: ROUTES.movimentos, label: "Movimentos", icon: ArrowLeftRight, match: [ROUTES.movimentos] },
  { href: ROUTES.planejamento, label: "Planejar", icon: Compass, match: [ROUTES.planejamento, ROUTES.orcamentos, ROUTES.metas, ROUTES.reserva] },
  { href: ROUTES.crescer, label: "Crescer", icon: Sprout, match: [ROUTES.crescer, ROUTES.investimentos, ROUTES.patrimonio, ROUTES.aulas] },
];
const PROFILE: NavItem = { href: ROUTES.perfil, label: "Perfil", icon: UserRound, match: [ROUTES.perfil] };

// "/app" is the product root, so it only matches exactly; other sections also match their sub-paths.
const isActive = (item: NavItem, path: string) => item.match.some((m) => path === m || (m !== ROUTES.home && path.startsWith(`${m}/`)));

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
/** Without plan access the main action leads to the checkout instead of the composer. */
export function FloatingNavDesktop({ locked = false }: { locked?: boolean }) {
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
        <Link href={ROUTES.home} className="grid size-12 place-items-center rounded-full" aria-label="Lastro — início">
          <LastroMark size={26} tone="dark" />
        </Link>
        <span className="mx-1 h-6 w-px bg-ink-900/10" aria-hidden />
        {NAV.map((item) => (
          <NavPill key={item.href} item={item} active={isActive(item, path)} layoutId="nav-desktop" />
        ))}
        <span className="mx-1 h-6 w-px bg-ink-900/10" aria-hidden />
        <Link
          href={ROUTES.perfil}
          aria-current={profileActive ? "page" : undefined}
          aria-label="Perfil"
          className={cn("grid size-12 place-items-center rounded-full transition-shadow", profileActive && "ring-2 ring-midnight ring-offset-2 ring-offset-white")}
        >
          <Avatar name={state.user.name} photo={state.user.photo} size={44} />
        </Link>
        {locked ? (
          <Link
            href={CHECKOUT_ROUTE}
            className="ml-1 flex h-12 items-center gap-2 rounded-full bg-mint pr-5 pl-4 text-[15px] font-semibold text-midnight shadow-[0_10px_24px_-10px_rgba(24,224,174,0.9)] transition-transform active:scale-[0.97]"
          >
            <LockOpen className="size-5" strokeWidth={2.3} />
            Liberar acesso
          </Link>
        ) : (
          <TactileButton
            magnetic
            onClick={() => openComposer({ type: "expense" })}
            className="ml-1 flex h-12 items-center gap-2 rounded-full bg-mint pr-5 pl-4 text-[15px] font-semibold text-midnight shadow-[0_10px_24px_-10px_rgba(24,224,174,0.9)]"
          >
            <Plus className="size-5" strokeWidth={2.5} />
            Gasto
            <kbd className="ml-1 rounded-md bg-midnight/10 px-1.5 font-sans text-[11px]">N</kbd>
          </TactileButton>
        )}
      </nav>
    </header>
  );
}

/** Mobile: a native-feeling floating capsule + a separate green orb for the main action. */
export function FloatingNavMobile({ locked = false }: { locked?: boolean }) {
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
      {locked ? (
        <Link
          href={CHECKOUT_ROUTE}
          className="pointer-events-auto grid size-[60px] shrink-0 place-items-center rounded-full bg-mint text-midnight shadow-[0_14px_30px_-10px_rgba(24,224,174,0.95),inset_0_1px_0_rgba(255,255,255,0.5)] transition-transform active:scale-[0.95]"
          aria-label="Liberar meu acesso"
        >
          <LockOpen className="size-6" strokeWidth={2.3} />
        </Link>
      ) : (
        <TactileButton
          onClick={() => openComposer({ type: "expense" })}
          className="pointer-events-auto grid size-[60px] shrink-0 place-items-center rounded-full bg-mint text-midnight shadow-[0_14px_30px_-10px_rgba(24,224,174,0.95),inset_0_1px_0_rgba(255,255,255,0.5)]"
          aria-label="Registrar gasto"
        >
          <Plus className="size-7" strokeWidth={2.5} />
        </TactileButton>
      )}
    </div>
  );
}
