"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plane, ShieldCheck, Sparkles, TrendingUp, Utensils } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { ease, spring } from "@/design-system/motion";
import { NetWorthChart } from "@/components/shared/data-viz/NetWorthChart";
import { Orbit } from "@/components/shared/data-viz/Orbit";
import { ProtectionLayers } from "@/components/shared/data-viz/ProtectionLayers";
import { AnimatedMoney, AnimatedPercentage } from "@/components/shared/motion/AnimatedNumber";
import { CurvedGauge } from "@/components/shared/surfaces/CurvedGauge";
import { ProgressPath } from "@/components/shared/surfaces/ProgressPath";
import { Capsule, FinancialSurface } from "@/components/shared/surfaces/Surface";
import { DEMO, DEMO_ALLOCATION, DEMO_BUDGET, DEMO_MILESTONES, DEMO_NET_WORTH } from "./demo-data";
import { Rise, Section, SectionHeading, WhenSeen } from "./motion";

/* ------------------------------------------------------------------ */
/* Budget — decisions, not percentages                                 */
/* ------------------------------------------------------------------ */

export function BudgetShowcase() {
  const free = DEMO_BUDGET.limit - DEMO_BUDGET.spent;
  const daily = Math.round(free / 8);
  return (
    <Section id="recursos" labelledBy="budget-title">
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <SectionHeading
            id="budget-title"
            kicker="Orçamento"
            title={
              <>
                Saiba quanto pode gastar.
                <br className="hidden sm:block" /> Não só quanto já gastou.
              </>
            }
            lead="O Lastro traduz o orçamento numa resposta: quanto ainda cabe — hoje e até o fim do mês."
          />
        </div>
        <WhenSeen className="lg:col-span-5 lg:col-start-8" minHeight={340}>
          <FinancialSurface tone="light" radius="organic" className="p-7 sm:p-8">
            <p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.14em] text-[#12B886] uppercase">
              <Utensils className="size-4" /> {DEMO_BUDGET.category}
            </p>
            <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4">
              <div>
                <AnimatedMoney value={free} size="display" cents={false} className="text-ink-900" />
                <p className="mt-1 text-[18px] font-medium text-ink-700">livres</p>
              </div>
              <CurvedGauge value={DEMO_BUDGET.spent / DEMO_BUDGET.limit} marker={0.74} size={112} color="#12B886" />
            </div>
            <p className="mt-6 inline-flex items-center rounded-full bg-mint/15 px-4 py-2 text-[17px] font-semibold text-mint-ink">≈ R$ {daily} por dia</p>
            <p className="mt-4 text-[14px] text-ink-400">
              R$ {formatNumber(DEMO_BUDGET.spent, 0)} usados de R$ {formatNumber(DEMO_BUDGET.limit, 0)}
            </p>
          </FinancialSurface>
        </WhenSeen>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Reserve — the emotional moment                                      */
/* ------------------------------------------------------------------ */

export function ReserveShowcase() {
  return (
    <section aria-labelledby="reserve-title" className="relative px-4 py-24 sm:px-6 lg:px-10 lg:py-36">
      <div className="surface-navy mx-auto max-w-[1200px] overflow-hidden rounded-[48px] px-6 py-16 sm:px-12 lg:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <SectionHeading id="reserve-title" tone="light" kicker="Reserva de emergência" title="Sua reserva deixa de ser um número." lead="Veja quanto tempo ela sustenta a sua vida de hoje — em meses e em dias." />
            <Rise as="p" delay={0.25} className="mt-8 font-display text-[clamp(26px,3vw,36px)] leading-tight font-semibold text-white">
              {DEMO.reserve.days} dias de tranquilidade financeira.
            </Rise>
          </div>
          <WhenSeen className="order-1 flex justify-center lg:order-2" minHeight={340}>
            <div className="w-[300px]">
              <ProtectionLayers months={DEMO.reserve.months} target={DEMO.reserve.targetMonths} size={300}>
                <div>
                  <p className="font-display text-[56px] leading-none font-semibold tracking-[-0.05em] text-ink-900">{formatNumber(DEMO.reserve.months, 1)}</p>
                  <p className="mt-1 text-[13px] font-bold tracking-[0.18em] text-ink-500">MESES</p>
                </div>
              </ProtectionLayers>
            </div>
          </WhenSeen>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Goal — closer than it feels                                         */
/* ------------------------------------------------------------------ */

export function GoalShowcase() {
  const progress = DEMO.goal.saved / DEMO.goal.target;
  return (
    <Section labelledBy="goal-title">
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <WhenSeen className="order-2 lg:order-1 lg:col-span-5" minHeight={380}>
          <FinancialSurface tone="light" radius="organicR" className="relative p-7 sm:p-8" style={{ background: `linear-gradient(155deg, #ffffff 0%, ${DEMO.goal.color}1c 100%)` }}>
            <svg viewBox="0 0 120 120" className="pointer-events-none absolute -top-8 -right-8 size-44" aria-hidden>
              <circle cx="60" cy="60" r="44" fill="none" stroke={DEMO.goal.color} strokeOpacity="0.35" strokeWidth="14" />
              <circle cx="60" cy="60" r="18" fill={DEMO.goal.color} fillOpacity="0.55" />
            </svg>
            <p className="relative flex items-center gap-2 text-[13px] font-bold tracking-[0.14em] uppercase" style={{ color: DEMO.goal.color }}>
              <Plane className="size-4" /> Viagem {DEMO.goal.name}
            </p>
            <AnimatedPercentage value={progress} className="relative mt-5 font-display text-[clamp(64px,8vw,88px)] leading-none font-semibold tracking-[-0.045em] text-ink-900" />
            <div className="relative mt-6">
              <ProgressPath value={progress} color={DEMO.goal.color} />
            </div>
            <div className="relative mt-2 flex items-baseline justify-between text-[15px]">
              <span className="font-semibold text-ink-900">R$ {formatNumber(DEMO.goal.saved, 0)}</span>
              <span className="text-ink-500">de R$ {formatNumber(DEMO.goal.target, 0)}</span>
            </div>
            <p className="relative mt-4 text-[16px] font-medium text-ink-700">Neste ritmo: {DEMO.goal.eta}</p>
          </FinancialSurface>
        </WhenSeen>
        <div className="order-1 lg:order-2 lg:col-span-6 lg:col-start-7">
          <SectionHeading id="goal-title" kicker="Metas" title="Metas que parecem mais próximas." lead="Cada aporte move a meta e a data de chegada. Você vê quando chega — no seu ritmo." />
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Net worth — the story of what you're building                       */
/* ------------------------------------------------------------------ */

export function NetWorthShowcase() {
  const reduce = useReducedMotion();
  return (
    <Section labelledBy="nw-title">
      <SectionHeading id="nw-title" kicker="Patrimônio" title="Veja o que você está construindo." />
      <WhenSeen className="mt-12" minHeight={420}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-4">
            <p className="text-[16px] font-medium text-ink-500">Patrimônio</p>
            <AnimatedMoney value={DEMO.netWorth.now} size="display" cents={false} className="mt-1 text-ink-900" />
            <p className="mt-3 inline-flex items-center gap-1.5 text-[18px] font-semibold text-mint-ink">
              <TrendingUp className="size-5" /> + R$ {formatNumber(DEMO.netWorth.monthDelta, 0)} este mês
            </p>
            <ul className="mt-8 flex flex-col gap-2" aria-label="Marcos">
              {DEMO_MILESTONES.map((m, i) => (
                <motion.li
                  key={m.id}
                  initial={reduce ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, ease: ease.out, delay: 0.9 + i * 0.15 }}
                  className="flex items-center gap-3 text-[15px] font-medium text-ink-900"
                >
                  <span className="size-2.5 rounded-full border-2 border-white bg-amber shadow" />
                  {m.title}
                </motion.li>
              ))}
            </ul>
          </div>
          <FinancialSurface tone="light" radius="xl" className="p-5 sm:p-8 lg:col-span-8">
            <NetWorthChart series={DEMO_NET_WORTH} milestones={DEMO_MILESTONES} height={260} />
          </FinancialSurface>
        </div>
      </WhenSeen>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Investments — allocation, contributions, the long run               */
/* ------------------------------------------------------------------ */

export function InvestmentShowcase() {
  const [selected, setSelected] = useState<string | null>(null);
  const total = DEMO_ALLOCATION.reduce((s, a) => s + a.value, 0);
  const max = Math.max(...DEMO_ALLOCATION.map((a) => a.value));
  const sel = selected ? DEMO_ALLOCATION.find((a) => a.id === selected) : undefined;
  return (
    <Section labelledBy="inv-title" className="overflow-hidden">
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading id="inv-title" kicker="Investimentos" title="Seu patrimônio em um só lugar." lead="Alocação, aportes e crescimento no longo prazo. Sem gráfico de pregão, sem pressa." />
          <Rise className="mt-8 flex flex-wrap gap-2" delay={0.2}>
            <Capsule tone="white" className="h-11 px-4 text-[15px]">
              Aporte mensal R$ {formatNumber(DEMO.investments.monthly, 0)}
            </Capsule>
            <Capsule tone="mint" className="h-11 px-4 text-[15px]">
              Já rendeu R$ {formatNumber(DEMO.investments.gain, 0)}
            </Capsule>
          </Rise>
        </div>
        <WhenSeen className="lg:col-span-6 lg:col-start-7" minHeight={420}>
          <Orbit
            mode="share"
            ariaLabel={`Carteira de exemplo com R$ ${formatNumber(total, 0)} por classe`}
            data={DEMO_ALLOCATION.map((a) => ({ id: a.id, label: a.label, weight: a.value, value: 0.35 + 0.65 * (a.value / max), color: a.color, colorTo: a.colorTo }))}
            selected={selected}
            onSelect={setSelected}
            center={
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={selected ?? "all"} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={spring.snappy} className="flex flex-col items-center">
                  <span className="eyebrow text-[11px] text-ink-500">{sel ? sel.label : "Investido"}</span>
                  <AnimatedMoney value={sel ? sel.value : total} size="lg" cents={false} className="mt-1 text-ink-900" />
                  <span className="mt-1 text-[13px] font-semibold text-ink-500">{sel ? `${formatNumber((sel.value / total) * 100, 0)}% da carteira` : "toque numa classe"}</span>
                </motion.div>
              </AnimatePresence>
            }
          />
        </WhenSeen>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Education — in context, not a course library                        */
/* ------------------------------------------------------------------ */

export function EducationMoment() {
  return (
    <Section labelledBy="edu-title" className="py-16 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading id="edu-title" kicker="Lastro Academy" title="Aprenda quando fizer sentido." lead="As aulas aparecem no momento certo, ligadas à sua situação — e terminam com a sua conta feita." />
        </div>
        <WhenSeen className="relative lg:col-span-6 lg:col-start-7" minHeight={260}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: ease.out }} className="surface-navy flex items-center gap-4 rounded-[32px] p-5 sm:w-[80%]">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/12 text-mint">
              <ShieldCheck className="size-5" />
            </span>
            <p className="font-display text-[20px] leading-snug font-semibold">Você já tem 3,2 meses de reserva.</p>
          </motion.div>
          <div aria-hidden className="ml-14 h-10 w-[2px] rounded-full bg-gradient-to-b from-deep/50 to-electric/40" />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: ease.out, delay: 0.45 }}
            className="surface-hero ml-auto flex items-center gap-4 rounded-[32px] p-5 sm:w-[86%]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20">
              <Sparkles className="size-5" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold tracking-[0.12em] text-white/75 uppercase">Aula · 4 min</span>
              <span className="mt-0.5 block font-display text-[22px] leading-tight font-semibold">Quanto deveria ter na reserva?</span>
            </span>
          </motion.div>
        </WhenSeen>
      </div>
    </Section>
  );
}
