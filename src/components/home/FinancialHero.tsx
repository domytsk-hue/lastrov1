"use client";

import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { balances, monthMomentum, monthSummary, netWorthChange, paceVsLastMonth } from "@/lib/finance";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressRing } from "@/components/ui/Progress";

/**
 * The first thing you see: how much is free to use, how the month is going,
 * and where the money went — as one composition instead of five KPI boxes.
 */
export function FinancialHero() {
  const { state, today } = useFinance();
  const { privacy, togglePrivacy } = useUI();

  const data = useMemo(() => {
    const b = balances(state, today);
    const m = monthSummary(state, today);
    return {
      b,
      m,
      momentum: monthMomentum(state, today),
      pace: paceVsLastMonth(state, today),
      nw: netWorthChange(state, today),
    };
  }, [state, today]);

  const { b, m, momentum, pace, nw } = data;
  const fresh = m.income === 0 && m.expenses === 0;
  const base = Math.max(m.income, m.expenses + m.invested + m.saved, 1);
  const seg = [
    { key: "expenses", value: m.expenses, color: "rgba(244,246,248,0.92)", label: "Gastos" },
    { key: "future", value: m.saved + m.invested, color: "#00D99B", label: "Guardado" },
  ];

  return (
    <section aria-label="Resumo financeiro" className="relative">
      <div className="relative overflow-hidden rounded-[28px] p-5 pb-6 sm:p-7">
        {/* atmosphere */}
        <div className="absolute inset-0 bg-[radial-gradient(130%_110%_at_0%_0%,#3a74ff_0%,#1d4fe0_28%,#0f2f97_58%,#0a1a55_82%,#081236_100%)]" aria-hidden />
        <div
          className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(90% 80% at 100% 0%, black, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="absolute -right-16 -bottom-24 h-64 w-64 rounded-full bg-[#7aa2ff]/25 blur-3xl" aria-hidden />

        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-white/70">Disponível agora</p>
            <button
              onClick={togglePrivacy}
              className="pressable -mr-1.5 grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={privacy ? "Mostrar valores" : "Ocultar valores"}
              aria-pressed={privacy}
            >
              {privacy ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>

          <MoneyValue value={b.available} size="hero" className="mt-1 text-white" />

          {/* Momentum */}
          <div className="mt-5 flex items-center gap-3">
            <ProgressRing value={fresh ? 0 : momentum / 100} size={44} stroke={4} color="#ffffff" track="rgba(255,255,255,0.18)">
              <span className="font-display text-[13px] font-semibold tabular text-white">{fresh ? "—" : momentum}</span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.08em] text-white/60 uppercase">Seu mês{fresh ? "" : ` · ${momentum}%`}</p>
              <p className="text-[14px] leading-snug text-white/90">
                {fresh ? (
                  "Registre sua primeira movimentação e o Lastro começa a medir seu mês."
                ) : Math.abs(pace) < 20 ? (
                  "Você está no mesmo ritmo do mês passado."
                ) : pace > 0 ? (
                  <>
                    Você está <strong className="font-semibold text-white"><Money value={pace} /></strong> melhor que neste ponto do mês passado.
                  </>
                ) : (
                  <>
                    Você gastou <strong className="font-semibold text-white"><Money value={-pace} /></strong> a mais que neste ponto do mês passado.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Month flow ribbon */}
          <div className="mt-6">
            <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-white/15" role="img" aria-label="Para onde foi a renda do mês">
              {seg.map((s, i) =>
                s.value > 0 ? (
                  <motion.div
                    key={s.key}
                    className="h-full first:rounded-l-full"
                    style={{ background: s.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(s.value / base) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null,
              )}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <dt className="text-[12px] text-white/60">Entrou</dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-white">
                  <Money value={m.income} />
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-[12px] text-white/60">
                  <span className="size-1.5 rounded-full bg-white" /> Saiu
                </dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-white">
                  <Money value={m.expenses} />
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-[12px] text-white/60">
                  <span className="size-1.5 rounded-full bg-green" /> Guardado
                </dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-white">
                  <Money value={m.invested + m.saved} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Attached net-worth strip — visually connected to the hero */}
      <Link
        href="/crescer"
        className="group relative -mt-5 flex items-center justify-between rounded-b-[28px] border border-t-0 border-white/[0.06] bg-surface-1 px-5 pt-8 pb-4 sm:px-7"
      >
        <div>
          <p className="text-[12px] font-medium text-muted">Patrimônio</p>
          <div className="flex items-baseline gap-2">
            <MoneyValue value={nw.now} size="md" cents={false} />
            {nw.monthDelta !== 0 && (
              <span className={cn("flex items-center gap-0.5 text-[13px] font-semibold", nw.monthDelta > 0 ? "text-green" : "text-soft")}>
                {nw.monthDelta > 0 && <TrendingUp className="size-3.5" />}
                <Money value={nw.monthDelta} sign />
                <span className="font-normal text-muted">no mês</span>
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-off" />
      </Link>
    </section>
  );
}
