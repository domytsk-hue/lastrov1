"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, Check, Lightbulb, Lock, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { balances, insights, netWorthChange, netWorthSeries, sum } from "@/lib/finance";
import { addMonths, formatNumber } from "@/lib/format";
import { weeklyMissions } from "@/lib/missions";
import type { InvestmentClass } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { FinancialTimeline } from "@/components/grow/FinancialTimeline";
import { LessonSheet } from "@/components/grow/LessonSheet";
import { NetWorthCard } from "@/components/grow/NetWorthCard";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressBar } from "@/components/ui/Progress";
import { Button, PageHeader, SectionHeader } from "@/components/ui/primitives";

const CLASS_META: Record<InvestmentClass, { label: string; color: string }> = {
  "renda-fixa": { label: "Renda fixa", color: "#5B8CFF" },
  acoes: { label: "Ações", color: "#8B6BFF" },
  fiis: { label: "FIIs", color: "#4FE3C1" },
  etfs: { label: "ETFs", color: "#00D99B" },
  fundos: { label: "Fundos", color: "#C77DFF" },
  internacional: { label: "Internacional", color: "#FFC234" },
  cripto: { label: "Cripto", color: "#FF8A5B" },
  outros: { label: "Outros", color: "#AEB4BD" },
};

export function GrowScreen() {
  const { state, today } = useFinance();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lessonId = params.get("aula");
  const lesson = state.lessons.find((l) => l.id === lessonId && l.available) ?? null;

  const series = useMemo(() => netWorthSeries(state, today), [state, today]);
  const change = useMemo(() => netWorthChange(state, today), [state, today]);
  const b = useMemo(() => balances(state, today), [state, today]);

  return (
    <>
      <PageHeader eyebrow="Crescer" title="Seu patrimônio" />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <NetWorthCard height={220} link={false} />
        </div>
        <section className="card p-5 lg:col-span-4" aria-label="Ativos e passivos">
          <p className="eyebrow">Como se forma</p>
          <dl className="mt-4 flex flex-col gap-3 text-[14px]">
            {[
              ["Contas e carteira", b.available],
              ["Reserva", b.reserve],
              ["Metas guardadas", b.goals],
              ["Investimentos", b.investments],
              ...(b.otherAssets ? [["Outros bens", b.otherAssets] as const] : []),
            ].map(([label, v]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-soft">{label}</dt>
                <dd className="font-medium tabular">
                  <Money value={v as number} />
                </dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-white/[0.06] pt-3">
              <dt className="text-soft">Dívidas (cartão e outras)</dt>
              <dd className="font-medium text-coral-light tabular">
                −<Money value={b.liabilities} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-3">
              <dt className="font-semibold">Patrimônio</dt>
              <dd>
                <MoneyValue value={b.netWorth} size="md" cents={false} />
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="timeline-title">
        <SectionHeader title="Sua linha do tempo" />
        <div className="card p-5 sm:p-6">
          <FinancialTimeline series={series} milestones={state.milestones} record={change.record} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Investments />
        </div>
        <div className="lg:col-span-5">
          <Missions />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Academy onOpen={(id) => router.replace(`${pathname}?aula=${id}`, { scroll: false })} />
        </div>
        <div className="lg:col-span-5">
          <InsightsList />
        </div>
      </div>

      <LessonSheet lesson={lesson} onClose={() => router.replace(pathname, { scroll: false })} />
    </>
  );
}

function Investments() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const reduce = useReducedMotion();
  const invested = state.investments.reduce((s, i) => s + i.invested, 0);
  const current = state.investments.reduce((s, i) => s + i.currentValue, 0);
  const ret = current - invested;
  const byClass = new Map<InvestmentClass, number>();
  for (const i of state.investments) byClass.set(i.class, (byClass.get(i.class) ?? 0) + i.currentValue);
  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
  const contributions = state.transactions.filter((t) => t.type === "investment" && t.date <= today && t.date > addMonths(today, -6));
  const avgMonthly = sum(contributions) / 6;

  return (
    <section aria-labelledby="inv-title">
      <SectionHeader title="Investimentos" action={<Button size="sm" variant="secondary" onClick={() => openComposer({ type: "investment" })}>Investir</Button>} />
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-soft">Valor atual</p>
            <MoneyValue value={current} size="xl" cents={false} className="mt-1" />
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-[12px] text-muted">Rendimento</p>
              <p className={cn("text-[15px] font-semibold tabular", ret >= 0 ? "text-green" : "text-coral-light")}>
                <Money value={ret} sign /> <span className="text-[12px] font-medium">({formatNumber((ret / Math.max(1, invested)) * 100, 1)}%)</span>
              </p>
            </div>
            <div>
              <p className="text-[12px] text-muted">Aporte médio</p>
              <p className="text-[15px] font-semibold tabular">
                <Money value={avgMonthly} />
                /mês
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex h-3 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label="Alocação da carteira">
          {classes.map(([c, v], i) => (
            <motion.div
              key={c}
              style={{ background: CLASS_META[c].color }}
              initial={reduce ? false : { width: 0 }}
              whileInView={{ width: `${(v / current) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
          {classes.map(([c, v]) => (
            <li key={c} className="flex items-center justify-between gap-2 text-[14px]">
              <span className="flex items-center gap-2 text-soft">
                <span className="size-2 rounded-full" style={{ background: CLASS_META[c].color }} />
                {CLASS_META[c].label}
              </span>
              <span className="font-medium tabular">{formatNumber((v / current) * 100, 0)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] text-muted">Foco no longo prazo: o que importa é a constância dos aportes, não a oscilação do dia.</p>
      </div>
    </section>
  );
}

function Missions() {
  const { state, today } = useFinance();
  const missions = useMemo(() => weeklyMissions(state, today), [state, today]);
  const done = missions.filter((m) => m.done).length;
  return (
    <section aria-labelledby="missions-title">
      <SectionHeader title="Missões da semana" action={<span className="text-[13px] font-semibold text-yellow tabular">{done}/{missions.length}</span>} />
      <ul className="card divide-y divide-white/[0.05] p-2">
        {missions.map((m) => (
          <li key={m.id} className="flex items-start gap-3 p-3">
            <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", m.done ? "bg-yellow text-ink" : "bg-white/[0.06] text-muted")}>
              {m.done ? <Check className="size-4" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[14px] font-medium", m.done && "text-soft line-through decoration-white/20")}>{m.title}</p>
              {m.target > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={m.progress / m.target} color="var(--color-yellow)" height={4} />
                  <span className="shrink-0 text-[12px] text-muted tabular">
                    {formatNumber(m.progress, 0)}/{m.target}
                  </span>
                </div>
              )}
              <p className="mt-1 text-[12px] text-muted">Desbloqueia: {m.reward}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Academy({ onOpen }: { onOpen: (id: string) => void }) {
  const { state } = useFinance();
  return (
    <section aria-labelledby="academy-title">
      <SectionHeader title="Lastro Academy" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {state.lessons.map((l, i) => (
          <li key={l.id}>
            <button
              disabled={!l.available}
              onClick={() => onOpen(l.id)}
              className={cn(
                "card pressable flex h-full w-full flex-col items-start p-4 text-left disabled:cursor-not-allowed",
                i === 0 ? "bg-gradient-to-br from-purple-deep to-surface-1 sm:col-span-2" : "",
                l.available && "hover:border-white/10",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.1em] text-purple-light uppercase">{l.category}</span>
                {l.completed ? <Check className="size-4 text-green" /> : !l.available ? <Lock className="size-3.5 text-muted" /> : <BookOpen className="size-4 text-purple-light" />}
              </span>
              <span className={cn("mt-2 font-display text-[17px] leading-snug font-semibold", !l.available && "text-soft")}>{l.title}</span>
              <span className="mt-auto pt-3 text-[12px] text-muted">{l.available ? `${l.minutes} min · termina com uma ação real` : "Em breve"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsightsList() {
  const { state, today } = useFinance();
  const list = useMemo(() => insights(state, today), [state, today]);
  const icon = { positive: TrendingUp, neutral: Lightbulb, attention: TriangleAlert };
  const color = { positive: "text-green", neutral: "text-purple-light", attention: "text-yellow" };
  return (
    <section aria-labelledby="ins-title">
      <SectionHeader title="Insights" />
      <ul className="flex flex-col gap-2">
        {list.map((i) => {
          const Icon = icon[i.tone];
          return (
            <li key={i.id} className="card flex gap-3 p-4">
              <Icon className={cn("mt-0.5 size-4 shrink-0", color[i.tone])} />
              <div>
                <p className="text-[14px] leading-snug font-medium">{i.title}</p>
                {i.body && <p className="mt-1 text-[13px] text-soft">{i.body}</p>}
                {i.action && (
                  <Link href={i.action.href} className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-off hover:text-green">
                    {i.action.label} <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
