"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowDownLeft, ArrowUpRight, Eye, EyeOff, Minus, PiggyBank, TrendingUp, type LucideIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { balances, monthSummary, paceVsLastMonth } from "@/product/domain/finance";
import { spring, tween } from "@/design-system/motion";
import { useFinance } from "@/product/store/finance-store";
import { useUI, type ComposerRequest } from "@/product/store/ui-store";
import { useFlowArrival } from "@/components/product/shell/FlowLayer";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { Capsule, FinancialSurface, TactileButton } from "@/components/shared/surfaces/Surface";

export const BALANCE_TARGET = '[data-flow-target="balance"]';

/**
 * <BlueHero /> — the financial object at the top of Lastro.
 * One surface: what's available, how the month compares, the four actions set into it,
 * and a connected tray where the month's money visibly flows.
 */
export function BlueHero() {
  const { state, today } = useFinance();
  const { privacy, togglePrivacy } = useUI();
  const reduce = useReducedMotion();
  const [glow, setGlow] = useState<null | "spend" | "gain" | "save">(null);

  const d = useMemo(() => {
    const b = balances(state, today);
    const m = monthSummary(state, today);
    return { b, m, pace: paceVsLastMonth(state, today) };
  }, [state, today]);

  useFlowArrival(
    BALANCE_TARGET,
    useCallback((tone) => {
      setGlow(tone);
      window.setTimeout(() => setGlow(null), 700);
    }, []),
  );

  const fresh = d.m.income === 0 && d.m.expenses === 0;

  return (
    <FinancialSurface tone="hero" radius="xl" className="p-2" aria-label="Seu dinheiro agora">
      {/* arrival glow */}
      <AnimatePresence>
        {glow && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: glow === "spend" ? "radial-gradient(60% 50% at 30% 30%, rgba(255,255,255,0.35), transparent)" : "radial-gradient(60% 50% at 30% 30%, rgba(24,224,174,0.45), transparent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween("slow")}
          />
        )}
      </AnimatePresence>

      <div className="px-4 pt-4 pb-5 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-medium text-white/80">Disponível</p>
          <TactileButton
            onClick={togglePrivacy}
            className="surface-glass grid size-10 place-items-center rounded-full text-white"
            aria-label={privacy ? "Mostrar valores" : "Ocultar valores"}
            aria-pressed={privacy}
          >
            {privacy ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </TactileButton>
        </div>

        <div data-flow-target="balance" className="mt-2 inline-block">
          <AnimatedMoney value={d.b.available} size="display" className="text-white drop-shadow-[0_2px_12px_rgba(7,26,59,0.18)]" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {fresh ? (
            <p className="text-[15px] text-white/85">Registre sua primeira movimentação e o Lastro começa a medir seu mês.</p>
          ) : Math.abs(d.pace) < 20 ? (
            <Capsule>No mesmo ritmo do mês passado</Capsule>
          ) : (
            <>
              <Capsule className={d.pace > 0 ? "" : "bg-white/10"}>
                {d.pace > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDown className="size-4" />}
                <Money value={Math.abs(d.pace)} />
              </Capsule>
              <span className="text-[14px] text-white/80">{d.pace > 0 ? "melhor que neste momento do mês passado" : "a mais que neste momento do mês passado"}</span>
            </>
          )}
        </div>

        <QuickActions />
      </div>

      <FlowTray income={d.m.income} spent={d.m.expenses} saved={d.m.saved + d.m.invested} />
    </FinancialSurface>
  );
}

/* ---------------- Embedded actions ---------------- */

const ACTIONS: { label: string; icon: LucideIcon; req: ComposerRequest; primary?: boolean }[] = [
  { label: "Gastar", icon: Minus, req: { type: "expense" }, primary: true },
  { label: "Receber", icon: ArrowDownLeft, req: { type: "income" } },
  { label: "Guardar", icon: PiggyBank, req: { type: "transfer", toReserve: true } },
  { label: "Investir", icon: TrendingUp, req: { type: "investment" } },
];

function QuickActions() {
  const { openComposer } = useUI();
  return (
    <div className="mt-6 grid grid-cols-4 gap-2 sm:max-w-md">
      {ACTIONS.map((a) => (
        <TactileButton key={a.label} magnetic onClick={() => openComposer(a.req)} className="group flex flex-col items-center gap-2 rounded-[22px] py-1 outline-offset-2">
          <span
            className={cn(
              "grid size-[58px] place-items-center rounded-full transition-colors",
              a.primary ? "bg-mint text-midnight shadow-[0_10px_24px_-8px_rgba(24,224,174,0.8),inset_0_1px_0_rgba(255,255,255,0.6)]" : "surface-glass text-white group-hover:bg-white/25",
            )}
          >
            <a.icon className="size-[22px]" strokeWidth={2.2} />
          </span>
          <span className="text-[13px] font-semibold text-white/90">{a.label}</span>
        </TactileButton>
      ))}
    </div>
  );
}

/* ---------------- Money flow ---------------- */

/** Entrou → saiu → guardado, with small particles travelling along the track. */
function FlowTray({ income, spent, saved }: { income: number; spent: number; saved: number }) {
  const reduce = useReducedMotion();
  const stops = [
    { label: "Entrou", value: income, dot: "bg-white" },
    { label: "Saiu", value: spent, dot: "bg-sky" },
    { label: "Guardado", value: saved, dot: "bg-mint" },
  ];
  return (
    <div className="relative rounded-[32px] bg-[#1f4fc4]/45 [container-type:inline-size] px-4 pt-4 pb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_10px_30px_-10px_rgba(7,26,59,0.35)] sm:px-6">
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
          <motion.div key={s.label} className={cn(i === 1 && "text-center", i === 2 && "text-right")} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: 0.35 + i * 0.08 }}>
            <dt className="text-[13px] font-medium text-white/70">{s.label}</dt>
            <dd className="mt-0.5 text-white">
              <AnimatedMoney value={s.value} size="md" cents={false} />
            </dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}
