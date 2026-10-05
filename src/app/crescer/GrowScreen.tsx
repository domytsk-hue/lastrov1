"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, Check, ChevronDown, Lightbulb, Lock, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { balances, insights, netWorthChange, netWorthSeries, sum } from "@/lib/finance";
import { addMonths, formatNumber } from "@/lib/format";
import { weeklyMissions } from "@/lib/missions";
import { spring } from "@/lib/motion";
import type { InvestmentClass } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { FinancialTimeline } from "@/components/grow/FinancialTimeline";
import { LessonSheet } from "@/components/grow/LessonSheet";
import { Orbit } from "@/components/orbit/Orbit";
import { AnimatedMoney, Money } from "@/components/ui/AnimatedNumber";
import { Button, PageHeader } from "@/components/ui/primitives";
import { Capsule, FinancialSurface, StoryTitle, TabbedSurface } from "@/components/surfaces/Surface";

const CLASS_META: Record<InvestmentClass, { label: string; color: string; to: string }> = {
  "renda-fixa": { label: "Renda fixa", color: "#173D91", to: "#3678F5" },
  etfs: { label: "ETFs", color: "#2459D6", to: "#65B7F2" },
  fiis: { label: "FIIs", color: "#0FB98F", to: "#18E0AE" },
  internacional: { label: "Internacional", color: "#3678F5", to: "#8CCBFF" },
  acoes: { label: "Ações", color: "#0B2560", to: "#2C63D8" },
  fundos: { label: "Fundos", color: "#4F6A8E", to: "#9DB4D3" },
  cripto: { label: "Cripto", color: "#E89A0C", to: "#FFC234" },
  outros: { label: "Outros", color: "#7890AF", to: "#B8C8DD" },
};

export function GrowScreen() {
  const { state } = useFinance();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lesson = state.lessons.find((l) => l.id === params.get("aula") && l.available) ?? null;

  return (
    <>
      <PageHeader eyebrow="Longo prazo, sem pressa" title="Crescer" />
      <div className="flex flex-col gap-14">
        <NetWorth />
        <section aria-labelledby="timeline-title">
          <StoryTitle id="timeline-title" title="Sua história" kicker="Patrimônio mês a mês" />
          <FinancialTimelineSection />
        </section>
        <Investments />
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <Academy onOpen={(id) => router.replace(`${pathname}?aula=${id}`, { scroll: false })} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Missions />
          </div>
        </div>
        <InsightsList />
      </div>
      <LessonSheet lesson={lesson} onClose={() => router.replace(pathname, { scroll: false })} />
    </>
  );
}

/* ---------------- Net worth ---------------- */

function NetWorth() {
  const { state, today } = useFinance();
  const [open, setOpen] = useState(false);
  const series = useMemo(() => netWorthSeries(state, today), [state, today]);
  const ch = useMemo(() => netWorthChange(state, today), [state, today]);
  const b = useMemo(() => balances(state, today), [state, today]);
  const parts: [string, number][] = [
    ["Contas e carteira", b.available],
    ["Reserva", b.reserve],
    ["Metas guardadas", b.goals],
    ["Investimentos", b.investments],
    ...(b.otherAssets ? ([["Outros bens", b.otherAssets]] as [string, number][]) : []),
  ];

  return (
    <section aria-labelledby="nw-title">
      <div className="grid items-end gap-6 lg:grid-cols-12">
        <div className="px-1 lg:col-span-5">
          <p id="nw-title" className="text-[16px] font-medium text-ink-500">
            Patrimônio
          </p>
          <AnimatedMoney value={ch.now} size="display" cents={false} className="mt-1 text-ink-900" />
          <p className="mt-3 font-display text-[22px] leading-snug font-semibold tracking-[-0.02em] text-ink-900">
            {series.length < 2 ? (
              "Hoje é o primeiro ponto da sua história."
            ) : ch.yearDelta > 0 ? (
              <>
                Cresceu <span className="text-mint-ink"><Money value={ch.yearDelta} /></span> em {series.length - 1} meses.
              </>
            ) : (
              "Estável nos últimos meses."
            )}
          </p>
          {ch.record && (
            <Capsule tone="mint" className="mt-3">
              Maior valor que você já teve
            </Capsule>
          )}
        </div>
        <FinancialSurface tone="light" radius="xl" className="p-5 sm:p-7 lg:col-span-7">
          <NetWorthChart series={series} milestones={state.milestones} height={220} />
        </FinancialSurface>
      </div>

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white/70 px-5 text-[15px] font-semibold text-ink-900 active:scale-[0.98]">
        Como se forma
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.soft} className="overflow-hidden">
            <div className="mt-4 flex flex-wrap gap-2">
              {parts.map(([label, v]) => (
                <Capsule key={label} tone="white" className="h-11 px-4 text-[15px]">
                  {label} <span className="text-ink-500"><Money value={v} /></span>
                </Capsule>
              ))}
              <Capsule tone="white" className="h-11 px-4 text-[15px]">
                Dívidas <span className="text-rose-ink">−<Money value={b.liabilities} /></span>
              </Capsule>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function FinancialTimelineSection() {
  const { state, today } = useFinance();
  const series = useMemo(() => netWorthSeries(state, today), [state, today]);
  const ch = useMemo(() => netWorthChange(state, today), [state, today]);
  return <FinancialTimeline series={series} milestones={state.milestones} record={ch.record} />;
}

/* ---------------- Investments: allocation orbit ---------------- */

function Investments() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const [selected, setSelected] = useState<string | null>(null);
  const invested = state.investments.reduce((s, i) => s + i.invested, 0);
  const current = state.investments.reduce((s, i) => s + i.currentValue, 0);
  const ret = current - invested;
  const byClass = new Map<InvestmentClass, number>();
  for (const i of state.investments) byClass.set(i.class, (byClass.get(i.class) ?? 0) + i.currentValue);
  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
  const max = classes[0]?.[1] ?? 1;
  const avgMonthly = sum(state.transactions.filter((t) => t.type === "investment" && t.date <= today && t.date > addMonths(today, -6))) / 6;
  const sel = selected ? classes.find(([c]) => c === selected) : undefined;

  return (
    <section aria-labelledby="inv-title" className="grid items-center gap-8 lg:grid-cols-12">
      <div className="lg:col-span-6">
        {classes.length === 0 ? (
          <FinancialSurface tone="light" radius="xl" className="p-8 text-center">
            <p className="font-display text-[24px] font-semibold">Seu primeiro aporte começa a órbita.</p>
            <Button className="mt-5" onClick={() => openComposer({ type: "investment" })}>
              Investir
            </Button>
          </FinancialSurface>
        ) : (
          <Orbit
            mode="share"
            ariaLabel={`Carteira de ${formatNumber(current, 0)} reais por classe`}
            data={classes.map(([c, v]) => ({ id: c, label: CLASS_META[c].label, weight: v, value: 0.35 + 0.65 * (v / max), color: CLASS_META[c].color, colorTo: CLASS_META[c].to }))}
            selected={selected}
            onSelect={setSelected}
            center={
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={selected ?? "all"} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={spring.snappy} className="flex flex-col items-center">
                  <span className="eyebrow text-[11px] text-ink-500">{sel ? CLASS_META[sel[0]].label : "Investido"}</span>
                  <AnimatedMoney value={sel ? sel[1] : current} size="lg" cents={false} className="mt-1 text-ink-900" />
                  <span className="mt-1 text-[13px] font-semibold text-ink-500">{sel ? `${formatNumber((sel[1] / current) * 100, 0)}% da carteira` : "toque numa classe"}</span>
                </motion.div>
              </AnimatePresence>
            }
          />
        )}
      </div>
      <div className="px-1 lg:col-span-6">
        <StoryTitle id="inv-title" title="Investimentos" kicker="Construção de patrimônio" className="px-0" />
        <p className="font-display text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink-900">
          {ret >= 0 ? (
            <>
              Seu dinheiro já rendeu <span className="text-mint-ink"><Money value={ret} /></span>.
            </>
          ) : (
            <>Oscilação de <Money value={ret} />. O longo prazo é o que conta.</>
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Capsule tone="white" className="h-10 px-4">
            Aporte médio <Money value={avgMonthly} />/mês
          </Capsule>
          {invested > 0 && (
            <Capsule tone="white" className="h-10 px-4">
              {formatNumber((ret / invested) * 100, 1)}% desde o início
            </Capsule>
          )}
        </div>
        <p className="mt-5 max-w-md text-[15px] text-ink-500">Constância importa mais que a oscilação do dia.</p>
        <Button className="mt-6" onClick={() => openComposer({ type: "investment" })}>
          <TrendingUp className="size-4" /> Investir
        </Button>
      </div>
    </section>
  );
}

/* ---------------- Missions ---------------- */

function Missions() {
  const { state, today } = useFinance();
  const missions = useMemo(() => weeklyMissions(state, today), [state, today]);
  const done = missions.filter((m) => m.done).length;
  return (
    <TabbedSurface color="navy" tab="Missões da semana" tabRight={<Capsule tone="tint">{done}/{missions.length}</Capsule>} aria-label="Missões da semana">
      <ul className="flex flex-col gap-4">
        {missions.map((m) => (
          <li key={m.id} className="flex items-start gap-3">
            <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", m.done ? "bg-mint text-midnight" : "bg-white/12 text-white/50")}>
              {m.done ? <Check className="size-4" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[16px] font-semibold", m.done && "text-white/55 line-through decoration-white/25")}>{m.title}</p>
              {m.target > 1 && !m.done && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12">
                    <motion.div className="h-full origin-left rounded-full bg-mint" initial={{ scaleX: 0 }} animate={{ scaleX: m.progress / m.target }} transition={spring.soft} />
                  </div>
                  <span className="text-[13px] text-white/60 tabular">
                    {formatNumber(m.progress, 0)}/{m.target}
                  </span>
                </div>
              )}
              <p className="mt-1 text-[13px] text-white/50">Desbloqueia: {m.reward}</p>
            </div>
          </li>
        ))}
      </ul>
    </TabbedSurface>
  );
}

/* ---------------- Academy ---------------- */

function Academy({ onOpen }: { onOpen: (id: string) => void }) {
  const { state } = useFinance();
  const [first, ...rest] = state.lessons;
  return (
    <section aria-labelledby="academy-title">
      <StoryTitle id="academy-title" title="Lastro Academy" kicker="Aulas curtas que terminam em ação" />
      {first && (
        <FinancialSurface tone="hero" radius="organic" interactive className="mb-4">
          <button disabled={!first.available} onClick={() => onOpen(first.id)} className="flex w-full items-center gap-4 p-6 text-left">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/20">{first.completed ? <Check className="size-6" /> : <BookOpen className="size-6" />}</span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold tracking-[0.12em] text-white/75 uppercase">{first.category}</span>
              <span className="mt-1 block font-display text-[24px] leading-tight font-semibold">{first.title}</span>
              <span className="mt-1 block text-[14px] text-white/75">{first.minutes} min · calcula a sua no final</span>
            </span>
            <ArrowRight className="size-5" />
          </button>
        </FinancialSurface>
      )}
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {rest.map((l) => (
          <li key={l.id} className="w-[70%] shrink-0 sm:w-auto">
            <div className="flex h-full flex-col rounded-[28px] bg-white/60 p-5">
              <span className="flex items-center justify-between text-[12px] font-semibold tracking-[0.1em] text-ink-500 uppercase">
                {l.category}
                <Lock className="size-3.5" />
              </span>
              <span className="mt-2 font-display text-[18px] leading-snug font-semibold text-ink-700">{l.title}</span>
              <span className="mt-auto pt-3 text-[13px] text-ink-400">Em breve</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Insights ---------------- */

function InsightsList() {
  const { state, today } = useFinance();
  const list = useMemo(() => insights(state, today), [state, today]);
  const icon = { positive: TrendingUp, neutral: Lightbulb, attention: TriangleAlert };
  const color = { positive: "text-mint-ink bg-mint/15", neutral: "text-electric bg-electric/10", attention: "text-amber-ink bg-amber/15" };
  return (
    <section aria-labelledby="ins-title">
      <StoryTitle id="ins-title" title="O que o Lastro percebeu" />
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((i) => {
          const Icon = icon[i.tone];
          return (
            <li key={i.id} className="flex gap-4 rounded-[28px] bg-white/75 p-5">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", color[i.tone])}>
                <Icon className="size-[18px]" />
              </span>
              <div>
                <p className="text-[16px] leading-snug font-semibold text-ink-900">{i.title}</p>
                {i.body && <p className="mt-1 text-[14px] text-ink-500">{i.body}</p>}
                {i.action && (
                  <Link href={i.action.href} className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-electric">
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
