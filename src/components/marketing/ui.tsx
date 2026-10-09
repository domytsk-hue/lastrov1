"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Minus, PiggyBank, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/auth/auth-store";
import { cn } from "@/lib/cn";
import { AUTH_ROUTES, CHECKOUT_ROUTE, ROUTES } from "@/config/routes";
import { spring } from "@/design-system/motion";
import { AnimatedMoney } from "@/components/shared/motion/AnimatedNumber";
import { Capsule, FinancialSurface, useMagnetic } from "@/components/shared/surfaces/Surface";

const MotionLink = motion.create(Link);

/**
 * The primary conversion action. Signed-out visitors go to account creation;
 * someone who already has a session goes straight into the product.
 */
export function PrimaryCta({
  label = "Começar agora",
  className,
  size = "lg",
  tone = "navy",
  plan,
}: {
  label?: string;
  className?: string;
  size?: "md" | "lg";
  tone?: "navy" | "mint" | "white";
  /** Chosen plan, carried to sign-up as ?plano= so checkout can pick it up later. */
  plan?: string;
}) {
  const { session } = useAuth();
  const m = useMagnetic<HTMLAnchorElement>(3);
  // The on-device demo is not an account: its visitors still go to sign-up.
  const signedIn = !!session && !session.demo;
  return (
    <MotionLink
      ref={m.ref}
      href={signedIn ? (plan ? `${CHECKOUT_ROUTE}?plano=${plan}` : ROUTES.home) : plan ? `${AUTH_ROUTES.cadastro}?plano=${plan}` : AUTH_ROUTES.cadastro}
      whileTap={{ scale: 0.97 }}
      animate={{ x: m.offset.x, y: m.offset.y }}
      transition={spring.snappy}
      {...m.handlers}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap",
        size === "lg" ? "h-14 px-7 text-[16px]" : "h-11 px-5 text-[15px]",
        tone === "navy" && "bg-midnight text-white shadow-[0_16px_34px_-14px_rgba(7,26,59,0.85)] hover:bg-deep",
        tone === "mint" && "bg-mint text-midnight shadow-[0_16px_34px_-14px_rgba(24,224,174,0.9)]",
        tone === "white" && "bg-white text-ink-900 shadow-[0_16px_34px_-14px_rgba(7,26,59,0.6)]",
        className,
      )}
    >
      {signedIn ? "Abrir o Lastro" : label}
      <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" />
    </MotionLink>
  );
}

export function SecondaryLink({ href, children, className, tone = "dark" }: { href: string; children: React.ReactNode; className?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-14 items-center justify-center rounded-full px-6 text-[16px] font-semibold transition-colors active:scale-[0.98]",
        tone === "dark" ? "bg-white/70 text-ink-900 shadow-[inset_0_1px_0_#fff,0_10px_24px_-16px_rgba(22,80,180,0.5)] hover:bg-white" : "bg-white/10 text-white hover:bg-white/15",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* BalanceSurface — the product's Home hero, fed with demo values      */
/* ------------------------------------------------------------------ */

const ACTIONS = [
  { label: "Gastar", icon: Minus, primary: true },
  { label: "Receber", icon: ArrowDownLeft },
  { label: "Guardar", icon: PiggyBank },
  { label: "Investir", icon: TrendingUp },
];

/**
 * Same composition, tokens and components as the app's BlueHero (balance with rolling digits,
 * comparison capsule, embedded actions, money-flow tray), but driven by props.
 * Purely illustrative: the action orbs are not buttons here.
 */
export function BalanceSurface({
  available,
  income,
  spent,
  saved,
  pace,
  showActions = true,
  compact = false,
  className,
}: {
  available: number;
  income: number;
  spent: number;
  saved: number;
  pace?: number;
  showActions?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const stops = [
    { label: "Entrou", value: income, dot: "bg-white" },
    { label: "Saiu", value: spent, dot: "bg-sky" },
    { label: "Guardado", value: saved, dot: "bg-mint" },
  ];
  return (
    <FinancialSurface tone="hero" radius="xl" className={cn("p-2", className)}>
      <div className={cn("px-4 pt-4", compact ? "pb-4" : "pb-5 sm:px-6 sm:pt-6")}>
        <p className="text-[15px] font-medium text-white/80">Disponível</p>
        <AnimatedMoney value={available} size={compact ? "hero" : "display"} className="mt-2 text-white drop-shadow-[0_2px_12px_rgba(7,26,59,0.18)]" />
        {pace !== undefined && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Capsule>
              <ArrowUpRight className="size-4" />
              R$ {pace.toLocaleString("pt-BR")}
            </Capsule>
            <span className="text-[14px] text-white/80">melhor que no mês passado</span>
          </div>
        )}
        {showActions && (
          <div className="mt-6 grid grid-cols-4 gap-2 sm:max-w-md" aria-hidden>
            {ACTIONS.map((a) => (
              <span key={a.label} className="flex flex-col items-center gap-2 py-1">
                <span
                  className={cn(
                    "grid place-items-center rounded-full",
                    compact ? "size-12" : "size-[58px]",
                    a.primary ? "bg-mint text-midnight shadow-[0_10px_24px_-8px_rgba(24,224,174,0.8),inset_0_1px_0_rgba(255,255,255,0.6)]" : "surface-glass text-white",
                  )}
                >
                  <a.icon className="size-[22px]" strokeWidth={2.2} />
                </span>
                <span className="text-[13px] font-semibold text-white/90">{a.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="relative rounded-[32px] bg-[#1f4fc4]/45 px-4 pt-4 pb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_10px_30px_-10px_rgba(7,26,59,0.35)] [container-type:inline-size] sm:px-6">
        <div className="relative mb-4 h-[3px] rounded-full bg-white/15" aria-hidden>
          {!reduce &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                style={{ animation: `lastro-flow 3.6s ${i * 1.2}s cubic-bezier(0.65,0,0.35,1) infinite`, ["--flow-distance" as string]: "calc(100cqw - 8px)" }}
              />
            ))}
          {stops.map((s, i) => (
            <span key={s.label} className={cn("absolute top-1/2 size-3 -translate-y-1/2 rounded-full ring-4 ring-[#2a5fd6]", s.dot)} style={{ left: `calc(${(i / 2) * 100}% - ${i === 0 ? 0 : i === 2 ? 12 : 6}px)` }} />
          ))}
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {stops.map((s, i) => (
            <div key={s.label} className={cn(i === 1 && "text-center", i === 2 && "text-right")}>
              <dt className="text-[13px] font-medium text-white/70">{s.label}</dt>
              <dd className="mt-0.5 text-white">
                <AnimatedMoney value={s.value} size="md" cents={false} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </FinancialSurface>
  );
}
