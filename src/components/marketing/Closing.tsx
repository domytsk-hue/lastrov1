"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { ArrowRight, BadgePercent, Check, KeyRound, Landmark, MonitorSmartphone, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { AUTH_ROUTES } from "@/config/routes";
import { PLANS, PLAN_BENEFITS, toMajorUnits, type PlanId } from "@/config/plans";
import { ease } from "@/design-system/motion";
import { Orbit } from "@/components/shared/data-viz/Orbit";
import { DEMO_DIMENSIONS } from "./demo-data";
import { Rise, Section, SectionHeading } from "./motion";
import { PrimaryCta, SecondaryLink } from "./ui";

/* ------------------------------------------------------------------ */
/* Why Lastro — what happened vs. what happens next                    */
/* ------------------------------------------------------------------ */

const PAIRS = [
  { others: "Você gastou R$\u00a0620.", lastro: "Você ainda pode gastar cerca de R$\u00a035 por dia." },
  { others: "Reserva: R$\u00a012.400.", lastro: "Sua reserva protege cerca de 96 dias." },
  { others: "Patrimônio: +4,2%.", lastro: "Seu patrimônio cresceu R$\u00a02.480 este mês." },
];

export function ProductComparison() {
  const reduce = useReducedMotion();
  return (
    <Section labelledBy="why-title">
      <SectionHeading
        id="why-title"
        align="center"
        kicker="Por que o Lastro"
        title={
          <>
            Outros apps mostram o que aconteceu.
            <br className="hidden md:block" /> O Lastro mostra o que vem depois.
          </>
        }
      />
      <div className="mx-auto mt-14 max-w-[920px]">
        <div className="mb-3 hidden grid-cols-2 gap-4 px-6 text-[13px] font-semibold tracking-[0.14em] text-ink-500 uppercase sm:grid">
          <span>O de sempre</span>
          <span>No Lastro</span>
        </div>
        <ul className="flex flex-col gap-3">
          {PAIRS.map((p, i) => (
            <motion.li
              key={p.lastro}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, ease: ease.out, delay: i * 0.08 }}
              className="grid items-center gap-2 rounded-[32px] bg-white/60 p-2 sm:grid-cols-2 sm:gap-4"
            >
              <p className="px-4 pt-3 text-[17px] text-ink-500 sm:py-4">
                <span className="mr-2 text-[12px] font-semibold tracking-[0.12em] uppercase sm:hidden">De sempre:</span>
                {p.others}
              </p>
              <p className="flex items-center gap-3 rounded-[26px] bg-midnight px-5 py-4 font-display text-[19px] leading-snug font-semibold text-white">
                <ArrowRight className="size-5 shrink-0 text-mint" aria-hidden />
                {p.lastro}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Social proof — ready, hidden until there is real content            */
/* ------------------------------------------------------------------ */

export interface Testimonial {
  quote: string;
  name: string;
  context: string;
}

/**
 * Real testimonials only. The list is intentionally empty: the section renders nothing
 * until genuine quotes (with permission) are added here.
 */
export const TESTIMONIALS: Testimonial[] = [];

export function Testimonials({ items = TESTIMONIALS }: { items?: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <Section labelledBy="voices-title">
      <SectionHeading id="voices-title" align="center" kicker="Quem usa" title="Em palavras de quem usa." />
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {items.map((t) => (
          <li key={t.name} className="surface-light rounded-[32px] p-6">
            <blockquote className="font-display text-[19px] leading-snug text-ink-900">“{t.quote}”</blockquote>
            <p className="mt-4 text-[14px] text-ink-500">
              {t.name} · {t.context}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Trust — only what is true about the product today                   */
/* ------------------------------------------------------------------ */

const TRUST = [
  { icon: MonitorSmartphone, title: "Seus dados ficam no seu aparelho.", body: "Nesta versão, tudo o que você registra é salvo localmente, no seu navegador." },
  { icon: KeyRound, title: "Sua senha não é guardada em texto.", body: "Ela é transformada num código irreversível antes de ser salva." },
  { icon: Landmark, title: "Sem acesso ao seu banco.", body: "O Lastro não se conecta à sua conta bancária. Você decide o que entra." },
  { icon: Trash2, title: "Você apaga quando quiser.", body: "Recomeçar do zero é uma opção no seu perfil, a qualquer momento." },
];

export function TrustSection() {
  return (
    <Section labelledBy="trust-title" className="py-20 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeading id="trust-title" kicker="Confiança" title="Seu dinheiro, suas regras." />
        </div>
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
          {TRUST.map((t, i) => (
            <Rise key={t.title} as="div" delay={i * 0.06} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-deep shadow-[0_8px_20px_-12px_rgba(22,80,180,0.5)]">
                <t.icon className="size-5" />
              </span>
              <span>
                <span className="block font-display text-[19px] leading-snug font-semibold text-ink-900">{t.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-ink-700">{t.body}</span>
              </span>
            </Rise>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Plans — lifetime in front, monthly behind it as the reference price */
/* ------------------------------------------------------------------ */

/** Prices come from the plan catalog (src/config/plans.ts) — the same one checkout and server use. */
export const PRICING = {
  monthly: toMajorUnits(PLANS.mensal.amountMinor),
  lifetime: toMajorUnits(PLANS.vitalicio.amountMinor),
} as const;
const YEARLY = Math.round(PRICING.monthly * 12 * 100) / 100; // 238,80
const SAVING = Math.round((YEARLY - PRICING.lifetime) * 100) / 100; // 138,90

const INCLUDED = PLAN_BENEFITS;

/** "R$ 99" + ",90" — the product's money rhythm, big units and small cents. */
function Price({ value, className, cents = "text-[0.42em]" }: { value: number; className?: string; cents?: string }) {
  const [int, dec] = formatNumber(value, 2).split(",");
  return (
    <span className={cn("font-display font-semibold tracking-[-0.045em]", className)}>
      <span className="mr-1 align-top text-[0.36em] font-medium opacity-70">R$</span>
      {int}
      <span className={cn("align-top", cents)}>,{dec}</span>
    </span>
  );
}


/** The radio dot in each card's header — the keyboard target of the plan picker. */
function PlanRadio({ checked, onSelect, label, tone }: { checked: boolean; onSelect: () => void; label: string; tone: "light" | "dark" }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
        tone === "light" ? (checked ? "border-mint bg-mint" : "border-white/60") : checked ? "border-electric bg-electric" : "border-ink-400",
      )}
    >
      {checked && <Check className={cn("size-4", tone === "light" ? "text-midnight" : "text-white")} strokeWidth={3} aria-hidden />}
    </button>
  );
}

export function PricingSection() {
  const reduce = useReducedMotion();
  // Lifetime is the default and the priority; the monthly card is one tap away.
  const [plan, setPlan] = useState<PlanId>("vitalicio");
  const monthly = plan === "mensal";
  const appear = (delay: number, from: { x?: number; y?: number; rotate?: number }) =>
    ({
      initial: reduce ? false : { opacity: 0, ...from },
      whileInView: { opacity: 1, x: 0, y: 0 },
      viewport: { once: true, amount: 0.35 },
      transition: { duration: 0.8, ease: ease.out, delay },
    }) as const;

  return (
    <Section id="planos" labelledBy="plans-title" className="py-20 lg:py-28">
      <SectionHeading
        id="plans-title"
        align="center"
        kicker="Planos"
        title="Pague uma vez. Fique para sempre."
        lead="Os dois planos têm tudo do Lastro. A diferença é quanto você paga por isso."
      />

      <div role="radiogroup" aria-label="Escolha seu plano" className="relative mx-auto mt-14 flex max-w-[860px] flex-col items-center lg:mt-16 lg:flex-row lg:items-center lg:justify-center">
        {/* Monthly — behind, tilted, still fully readable: it is the reference that makes the saving obvious */}
        <motion.article
          {...appear(0.05, { x: -24, y: 12 })}
          aria-labelledby="plan-monthly"
          onClick={() => setPlan("mensal")}
          className={cn("relative w-full max-w-[400px] cursor-pointer transition-[translate] duration-500 lg:w-[360px]", monthly ? "z-20 lg:translate-x-0" : "z-0 lg:translate-x-12")}
        >
          <div
            className={cn(
              "surface-light origin-bottom rounded-[36px] p-6 transition-[scale,rotate,box-shadow,opacity] duration-500 sm:p-7",
              monthly
                ? "shadow-[0_0_0_2px_var(--color-electric),0_30px_60px_-30px_rgba(22,80,180,0.7)]"
                : "pb-14 opacity-95 hover:opacity-100 max-lg:scale-[0.94] sm:pb-14 lg:-rotate-3 lg:pr-20 lg:pb-7",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p id="plan-monthly" className="text-[13px] font-bold tracking-[0.14em] text-ink-500 uppercase">
                Mensal
              </p>
              <PlanRadio checked={monthly} onSelect={() => setPlan("mensal")} label={`Plano mensal, ${PLANS.mensal.priceLabel}`} tone="dark" />
            </div>
            <p className="mt-3 text-ink-900">
              <Price value={PRICING.monthly} className="text-[48px] leading-none" />
              <span className="ml-1 text-[16px] font-medium text-ink-500">/mês</span>
            </p>
            <p className="mt-5 inline-flex flex-col rounded-[20px] bg-white px-4 py-3 shadow-[0_10px_24px_-18px_rgba(22,80,180,0.6)]">
              <span className="text-[12px] font-semibold tracking-[0.1em] text-ink-500 uppercase">Em 12 meses</span>
              <span className="font-display text-[26px] leading-tight font-semibold tracking-[-0.03em] text-ink-900">
                R$ {formatNumber(YEARLY, 2)}
                <span className="text-[15px] font-medium text-ink-500"> por ano</span>
              </span>
            </p>
            <p className="mt-4 text-[14px] text-ink-700">Cobrança todo mês, enquanto você usar.</p>
            {monthly && <PrimaryCta label="Assinar o mensal" plan="mensal" className="mt-6 w-full" />}
          </div>
        </motion.article>

        {/* Lifetime — in front, the priority */}
        <motion.article
          {...appear(0.18, { y: 28 })}
          aria-labelledby="plan-lifetime"
          onClick={() => setPlan("vitalicio")}
          className={cn("relative w-full max-w-[420px] cursor-pointer lg:mt-0 lg:-ml-6 lg:w-[420px]", monthly ? "z-10 mt-4" : "z-10 -mt-10")}
        >
          <div
            className={cn(
              "surface-hero relative overflow-hidden rounded-[40px] p-7 shadow-[0_40px_80px_-30px_rgba(22,80,180,0.75)] transition-[scale,box-shadow] duration-500 sm:p-8",
              monthly ? "scale-[0.97]" : "shadow-[0_0_0_2px_var(--color-mint),0_40px_80px_-30px_rgba(22,80,180,0.75)]",
            )}
          >
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-white/15 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p id="plan-lifetime" className="text-[13px] font-bold tracking-[0.14em] text-white/80 uppercase">
                  Vitalício
                </p>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-mint px-3 py-1 text-[12px] font-bold text-midnight">Mais vantajoso</span>
                  <PlanRadio checked={!monthly} onSelect={() => setPlan("vitalicio")} label={`Plano vitalício, ${PLANS.vitalicio.priceLabel}`} tone="light" />
                </span>
              </div>

              <p className="mt-5 inline-flex rounded-full bg-midnight/40 px-3 py-1 text-[15px] font-semibold text-white/90">
                <s className="decoration-white/90 decoration-[1.5px]" aria-label={`De R$ ${formatNumber(YEARLY, 2)} por ano`}>R$ {formatNumber(YEARLY, 2)}/ano</s>
              </p>
              <p className="mt-1 text-white">
                <Price value={PRICING.lifetime} className="text-[72px] leading-[0.95] sm:text-[80px]" />
              </p>
              <p className="mt-2 text-[16px] font-semibold text-white">Pagamento único · acesso para sempre</p>

              <p className="mt-5 flex items-center gap-2 rounded-[20px] bg-midnight/35 px-4 py-3 text-[15px] leading-snug text-white">
                <BadgePercent className="size-5 shrink-0 text-mint" aria-hidden />
                <span>
                  Economize <strong className="font-semibold text-mint">R$ {formatNumber(SAVING, 2)}</strong> já no primeiro ano — e nunca mais pague.
                </span>
              </p>

              <ul className="mt-6 flex flex-col gap-2.5">
                {INCLUDED.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[15px] text-white/90">
                    <Check className="size-4 shrink-0 text-mint" strokeWidth={3} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <PrimaryCta label="Garantir o vitalício" plan="vitalicio" tone="white" className="mt-8 w-full" />
            </div>
          </div>
        </motion.article>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA — the conclusion of the story                             */
/* ------------------------------------------------------------------ */

export function FinalCTA() {
  const reduce = useReducedMotion();
  const data = DEMO_DIMENSIONS.map(({ id, label, value, color, colorTo }) => ({ id, label: "", value, color, colorTo }));
  return (
    <section aria-labelledby="final-title" className="relative px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
      <div className="surface-hero relative mx-auto max-w-[1200px] overflow-hidden rounded-[48px] px-6 py-20 text-center sm:px-12 lg:py-28">
        <motion.div
          aria-hidden
          inert
          className="pointer-events-none absolute top-1/2 left-1/2 w-[720px] -translate-x-1/2 -translate-y-1/2 opacity-25 mix-blend-soft-light lg:w-[900px]"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 120, ease: "linear", repeat: Infinity }}
        >
          <Orbit data={data} selected={null} onSelect={() => {}} breathe={false} ariaLabel="" center={null} />
        </motion.div>
        <div className="relative">
          <h2 id="final-title" className="mx-auto max-w-[18ch] font-display text-[clamp(38px,6vw,76px)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance text-white">
            Seu dinheiro já conta uma história. Comece a enxergar.
          </h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta label="Criar meu Lastro" tone="white" />
            <SecondaryLink href={AUTH_ROUTES.login} tone="light">
              Ver com dados de exemplo
            </SecondaryLink>
          </div>
        </div>
      </div>
    </section>
  );
}
