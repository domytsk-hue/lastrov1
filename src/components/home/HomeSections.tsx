"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownLeft, ArrowRight, ChevronLeft, ChevronRight, Flame, Lightbulb, Minus, PiggyBank, Plus, ShieldCheck, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import { allBudgets, goalStatus, insights, reserveStatus, streak } from "@/lib/finance";
import { formatMonthYear, formatNumber, formatRelativeDay, greeting, parseISODate } from "@/lib/format";
import type { FinancialInsight } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { EmptyState, SectionHeader, STATE_COLOR, StateBadge } from "@/components/ui/primitives";
import { LastroMark } from "@/components/shell/LastroMark";

/* ---------------- Header ---------------- */

export function HomeHeader() {
  const { state, today } = useFinance();
  const [hour] = useState(() => new Date().getHours());
  const s = streak(state, today);
  return (
    <header className="flex items-center justify-between pt-1 pb-5 lg:pb-7">
      <div className="flex items-center gap-3">
        <LastroMark size={30} className="lg:hidden" />
        <div>
          <p className="text-[13px] text-muted first-letter:uppercase">
            {parseISODate(today).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="font-display text-[22px] leading-tight font-semibold tracking-[-0.02em] lg:text-[30px]">
            {greeting(hour)}, {state.user.name}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {s > 0 && (
          <span className="flex h-9 items-center gap-1.5 rounded-full bg-yellow/10 px-3 text-[13px] font-semibold text-yellow" title={`${s} dias seguidos registrando`}>
            <Flame className="size-4" aria-hidden />
            <span className="tabular">{s}</span>
            <span className="sr-only">dias seguidos registrando</span>
          </span>
        )}
        <Link
          href="/perfil"
          className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-purple-light to-blue font-display text-[15px] font-semibold text-white"
          aria-label="Perfil"
        >
          {state.user.name.charAt(0)}
        </Link>
      </div>
    </header>
  );
}

/* ---------------- Quick actions ---------------- */

export function QuickActions({ className }: { className?: string }) {
  const { openComposer } = useUI();
  const actions = [
    { label: "Gasto", icon: Minus, onClick: () => openComposer({ type: "expense" }), primary: true },
    { label: "Receita", icon: ArrowDownLeft, onClick: () => openComposer({ type: "income" }) },
    { label: "Guardar", icon: PiggyBank, onClick: () => openComposer({ type: "transfer", toReserve: true }) },
    { label: "Investir", icon: TrendingUp, onClick: () => openComposer({ type: "investment" }) },
  ];
  return (
    <section aria-label="Ações rápidas" className={cn("grid grid-cols-4 gap-2", className)}>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick} className="pressable group flex flex-col items-center gap-2 rounded-[20px] py-1">
          <span
            className={cn(
              "grid size-14 place-items-center rounded-[20px] transition-colors",
              a.primary ? "bg-green text-ink group-hover:bg-green-light" : "bg-surface-2 text-off ring-1 ring-white/[0.06] group-hover:bg-graphite",
            )}
          >
            {a.primary ? (
              <span className="relative">
                <Plus className="size-6" strokeWidth={2.4} />
              </span>
            ) : (
              <a.icon className="size-[22px]" strokeWidth={2} />
            )}
          </span>
          <span className="text-[13px] font-medium text-soft group-hover:text-off">{a.label}</span>
        </button>
      ))}
    </section>
  );
}

/* ---------------- Budgets snapshot ---------------- */

export function BudgetSnapshot({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const list = useMemo(() => allBudgets(state, today), [state, today]);
  const variable = list.filter((b) => !b.fixed);
  const top = [...variable].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const remaining = variable.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  const daily = variable.reduce((s, b) => s + b.dailyAllowance, 0);

  if (list.length === 0) {
    return (
      <section aria-labelledby="budget-snap" className={className}>
        <SectionHeader title="Orçamento do mês" />
        <Link href="/orcamentos" className="card group flex items-center gap-4 p-5 hover:bg-surface-2">
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-purple/20 text-purple-light">
            <Plus className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Crie seu primeiro orçamento</span>
            <span className="text-[13px] text-soft">O Lastro mostra quanto dá para gastar por dia.</span>
          </span>
          <ArrowRight className="size-4 text-muted group-hover:text-off" />
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="budget-snap" className={className}>
      <SectionHeader title="Orçamento do mês" href="/orcamentos" />
      <div className="card p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-soft">Livre para o dia a dia</p>
            <MoneyValue value={remaining} size="lg" cents={false} className="mt-1" />
          </div>
          <p className="text-right text-[13px] leading-snug text-soft">
            Cerca de
            <br />
            <span className="text-[15px] font-semibold text-off">
              <Money value={daily} />
              /dia
            </span>
          </p>
        </div>
        <ul className="mt-5 flex flex-col gap-4">
          {top.map((b) => {
            const cat = getCategory(b.categoryId);
            return (
              <li key={b.categoryId}>
                <Link href="/orcamentos" className="group block">
                  <div className="mb-2 flex items-center gap-3">
                    <CategoryIcon id={b.categoryId} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14px] font-medium">
                        {cat.name}
                        {b.state !== "healthy" && <StateBadge state={b.state} className="!py-0 !text-[11px]" />}
                      </p>
                    </div>
                    <p className="text-[13px] text-soft tabular">
                      <span className="font-semibold text-off">
                        <Money value={b.spent} />
                      </span>{" "}
                      / <Money value={b.limit} />
                    </p>
                  </div>
                  <ProgressBar value={b.pct} color={b.state === "healthy" ? cat.color : STATE_COLOR[b.state]} height={6} marker={b.monthProgress} label={`${cat.name}: ${Math.round(b.pct * 100)}% usado`} />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[12px] text-muted">
          <span className="mr-1 inline-block h-2.5 w-[2px] translate-y-[2px] rounded bg-off/70" /> marca onde o mês está hoje
        </p>
      </div>
    </section>
  );
}

/* ---------------- Goals ---------------- */

export function GoalsStrip({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const r = useMemo(() => reserveStatus(state, today), [state, today]);
  return (
    <section aria-labelledby="goals-strip" className={className}>
      <SectionHeader title="Seus objetivos" href="/metas" />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
        <Link href="/reserva" className="card pressable w-[78%] shrink-0 snap-start p-4 hover:bg-surface-2 sm:w-[300px] lg:w-auto">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-[14px] bg-green/12 text-green">
              <ShieldCheck className="size-5" />
            </span>
            <ProgressRing value={r.progress} size={44} stroke={4} color="var(--color-green)">
              <span className="text-[11px] font-semibold tabular">{Math.round(r.progress * 100)}%</span>
            </ProgressRing>
          </div>
          <p className="mt-3 text-[13px] text-soft">Reserva de emergência</p>
          <p className="font-display text-[22px] font-semibold tracking-[-0.02em]">
            {formatNumber(r.months, 1)} <span className="text-[15px] font-medium text-soft">de {state.reserve.targetMonths} meses</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">{r.days} dias do seu custo de vida protegidos</p>
        </Link>

        {state.goals.map((g) => {
          const s = goalStatus(state, g, today);
          return (
            <div key={g.id} className="card w-[78%] shrink-0 snap-start p-4 sm:w-[300px] lg:w-auto">
              <Link href={`/metas#${g.id}`} className="block">
                <div className="flex items-start justify-between">
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ background: `${g.color}1f`, color: g.color }}>
                    {g.name}
                  </span>
                  <span className="font-display text-[20px] font-semibold tabular">{Math.round(s.progress * 100)}%</span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <MoneyValue value={s.saved} size="md" cents={false} />
                  <span className="text-[13px] text-muted">
                    de <Money value={g.target} />
                  </span>
                </div>
                <ProgressBar value={s.progress} color={g.color} height={6} className="mt-3" />
                <p className="mt-2.5 text-[13px] text-soft">{s.eta ? <>No seu ritmo: {formatMonthYear(s.eta)}</> : "Defina um aporte mensal para ver a data"}</p>
              </Link>
              <button
                onClick={() => openComposer({ type: "transfer", goalId: g.id })}
                className="pressable mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.05] text-[13px] font-semibold text-off hover:bg-white/[0.09]"
              >
                <Plus className="size-4" /> Guardar
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Insight ---------------- */

const TONE: Record<FinancialInsight["tone"], { icon: typeof Lightbulb; color: string }> = {
  positive: { icon: TrendingUp, color: "#00D99B" },
  neutral: { icon: Lightbulb, color: "#8B6BFF" },
  attention: { icon: TriangleAlert, color: "#FFC234" },
};

export function InsightCard({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const list = useMemo(() => insights(state, today), [state, today]);
  const [i, setI] = useState(0);
  if (!list.length) return null;
  const idx = i % list.length;
  const ins = list[idx];
  const tone = TONE[ins.tone];

  return (
    <section aria-label="Insight" className={cn("relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-purple-deep/80 via-surface-1 to-surface-1 p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.1em] text-purple-light uppercase">
          <tone.icon className="size-4" style={{ color: tone.color }} />
          Insight
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[12px] text-muted tabular">
            {idx + 1}/{list.length}
          </span>
          <button onClick={() => setI((v) => (v - 1 + list.length) % list.length)} className="pressable grid size-8 place-items-center rounded-full text-soft hover:bg-white/[0.06]" aria-label="Insight anterior">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => setI((v) => v + 1)} className="pressable grid size-8 place-items-center rounded-full text-soft hover:bg-white/[0.06]" aria-label="Próximo insight">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={ins.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }} aria-live="polite">
          <p className="mt-3 font-display text-[19px] leading-snug font-semibold tracking-[-0.015em] text-off">{ins.title}</p>
          {ins.body && <p className="mt-1.5 text-[14px] text-soft">{ins.body}</p>}
          {ins.action && (
            <Link href={ins.action.href} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-off hover:text-green">
              {ins.action.label} <ArrowRight className="size-4" />
            </Link>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/* ---------------- Recent transactions ---------------- */

export function RecentTransactions({ className, limit = 5 }: { className?: string; limit?: number }) {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const recent = state.transactions.filter((t) => t.date <= today).slice(0, limit);
  return (
    <section aria-labelledby="recent" className={className}>
      <SectionHeader title="Últimas movimentações" href="/movimentacoes" />
      <div className="card p-2">
        {recent.length === 0 ? (
          <EmptyState
            title="Seu mês começa aqui."
            body="Registre seu primeiro gasto e o Lastro começa a entender seu ritmo."
            action={
              <button onClick={() => openComposer({ type: "expense" })} className="pressable h-11 rounded-[14px] bg-green px-5 text-[14px] font-semibold text-ink">
                Registrar gasto
              </button>
            }
          />
        ) : (
          <ul>
            {recent.map((t) => (
              <TransactionRow key={t.id} tx={t} state={state} showDate={formatRelativeDay(t.date, today)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
