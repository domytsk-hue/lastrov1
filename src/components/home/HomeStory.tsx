"use client";

import { AnimatePresence } from "framer-motion";
import { ArrowRight, Flame, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { netWorthChange, netWorthSeries, reserveStatus, streak } from "@/lib/finance";
import { formatNumber, greeting, parseISODate } from "@/lib/format";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { GoalSurface } from "@/components/goals/GoalSurface";
import { ProtectionLayers } from "@/components/reserve/ProtectionLayers";
import { TransactionItem } from "@/components/transactions/TransactionItem";
import { AnimatedMoney, Money } from "@/components/ui/AnimatedNumber";
import { Capsule, FinancialSurface, StoryTitle, TabbedSurface } from "@/components/surfaces/Surface";

/* ---------------- Greeting ---------------- */

export function Greeting() {
  const { state, today } = useFinance();
  const [hour] = useState(() => new Date().getHours());
  const s = streak(state, today);
  const first = state.user.name.split(" ")[0];
  return (
    <header className="flex items-start justify-between gap-4 px-1">
      <div>
        <p className="text-[15px] font-medium text-ink-500 first-letter:uppercase">{parseISODate(today).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-1 font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink-900 sm:text-[44px]">
          {greeting(hour) === "Bom dia" ? "Bom dia" : "Olá"}, {first}
        </h1>
      </div>
      <div className="flex items-center gap-2 pt-1">
        {s > 1 && (
          <Capsule tone="white" className="h-10">
            <Flame className="size-4 text-amber" aria-hidden />
            <span className="tabular">{s}</span>
            <span className="sr-only">dias seguidos registrando</span>
          </Capsule>
        )}
        <Link
          href="/perfil"
          className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-sky to-electric font-display text-[17px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(54,120,245,0.8)] lg:hidden"
          aria-label="Perfil"
        >
          {state.user.name.charAt(0)}
        </Link>
      </div>
    </header>
  );
}

/* ---------------- Goals shelf ---------------- */

export function GoalShelf() {
  const { state, today } = useFinance();
  const r = useMemo(() => reserveStatus(state, today), [state, today]);
  return (
    <section aria-labelledby="goals-title">
      <StoryTitle id="goals-title" title="Seus objetivos" action={<SeeAll href="/metas" />} />
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-1 pb-6 no-scrollbar sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        <FinancialSurface tone="navy" radius="organic" interactive className="w-[82%] shrink-0 snap-start sm:w-[320px] lg:w-auto">
          <Link href="/reserva" className="flex h-full flex-col p-5 sm:p-6">
            <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.14em] text-mint uppercase">
              <ShieldCheck className="size-4" /> Reserva
            </p>
            <div className="mt-3 flex items-center gap-4">
              <ProtectionLayers months={r.months} target={state.reserve.targetMonths} size={92} compact />
              <div>
                <p className="font-display text-[48px] leading-none font-semibold tracking-[-0.04em]">{formatNumber(r.months, 1)}</p>
                <p className="mt-1 text-[15px] font-medium text-white/75">meses protegidos</p>
              </div>
            </div>
            <p className="mt-auto pt-5 text-[14px] text-white/65">{r.days} dias de tranquilidade</p>
          </Link>
        </FinancialSurface>
        {state.goals.map((g, i) => (
          <GoalSurface key={g.id} goal={g} index={i} className="w-[82%] shrink-0 snap-start sm:w-[320px] lg:w-auto" />
        ))}
      </div>
    </section>
  );
}

function SeeAll({ href, label = "Ver tudo" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-4 text-[14px] font-semibold text-ink-900 shadow-[inset_0_1px_0_#fff,0_8px_20px_-14px_rgba(22,80,180,0.5)]">
      {label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ---------------- Recent movements ---------------- */

export function RecentMoves({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const recent = state.transactions.filter((t) => t.date <= today).slice(0, 4);
  return (
    <TabbedSurface color="navy" className={className} aria-label="Últimos movimentos" tab="Últimos movimentos" tabRight={<SeeAll href="/movimentacoes" label="Todos" />} bodyClassName="p-2 sm:p-3">
      {recent.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-display text-[22px] font-semibold">Seu mês começa aqui.</p>
          <p className="mt-1 text-[15px] text-white/65">O primeiro gasto ensina ao Lastro o seu ritmo.</p>
          <button onClick={() => openComposer({ type: "expense" })} className="mt-5 h-12 rounded-full bg-mint px-6 text-[15px] font-semibold text-midnight active:scale-[0.97]">
            Registrar gasto
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {recent.map((t) => (
              <TransactionItem key={t.id} tx={t} tone="navy" />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </TabbedSurface>
  );
}

/* ---------------- Net worth ---------------- */

export function NetWorthStory({ className, height = 150 }: { className?: string; height?: number }) {
  const { state, today } = useFinance();
  const series = useMemo(() => netWorthSeries(state, today), [state, today]);
  const ch = useMemo(() => netWorthChange(state, today), [state, today]);
  const grew = ch.monthDelta > 0;
  return (
    <FinancialSurface tone="light" radius="lg" interactive className={cn("p-5 sm:p-6", className)}>
      <Link href="/crescer" className="block" aria-label="Ver patrimônio">
        <div className="flex items-start justify-between">
          <p className="eyebrow text-ink-500">Patrimônio</p>
          {ch.record && <Capsule tone="mint">Recorde</Capsule>}
        </div>
        <p className="mt-2 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
          {series.length < 2 ? "Seu patrimônio começa a contar a história." : grew ? "Seu patrimônio ganhou força." : "Seu patrimônio está estável."}
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <AnimatedMoney value={ch.now} size="lg" cents={false} className="text-ink-900" />
          {grew && (
            <span className="inline-flex items-center gap-1 text-[15px] font-semibold text-mint-ink">
              <TrendingUp className="size-4" />
              <Money value={ch.monthDelta} sign /> este mês
            </span>
          )}
        </div>
        <div className="mt-5">
          <NetWorthChart series={series} milestones={state.milestones} height={height} />
        </div>
      </Link>
    </FinancialSurface>
  );
}
