"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, KeyRound, Landmark, MonitorSmartphone, Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { AUTH_ROUTES } from "@/config/routes";
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
/* Plans — architecture ready, no invented prices                      */
/* ------------------------------------------------------------------ */

export interface Plan {
  name: string;
  price: number;
  period: "mês" | "ano";
  features: string[];
  highlighted?: boolean;
}

/** Empty until pricing is decided. With plans, the section renders them; without, an honest CTA. */
export const PLANS: Plan[] = [];

export function PricingSection({ plans = PLANS }: { plans?: Plan[] }) {
  return (
    <Section id="planos" labelledBy="plans-title" className="py-20 lg:py-28">
      {plans.length === 0 ? (
        <div className="surface-light mx-auto max-w-[880px] rounded-[48px] px-6 py-14 text-center sm:px-12">
          <SectionHeading id="plans-title" align="center" kicker="Planos" title="Planos em breve." lead="Por enquanto, criar sua conta não pede cartão de crédito. Comece agora e acompanhe as novidades por aqui." />
          <Rise className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" delay={0.2}>
            <PrimaryCta />
            <SecondaryLink href={AUTH_ROUTES.login}>Ver com dados de exemplo</SecondaryLink>
          </Rise>
        </div>
      ) : (
        <>
          <SectionHeading id="plans-title" align="center" kicker="Planos" title="Escolha seu plano." />
          <ul className="mx-auto mt-12 grid max-w-[960px] gap-4 md:grid-cols-2">
            {plans.map((p) => (
              <li key={p.name} className={p.highlighted ? "surface-hero rounded-[40px] p-8" : "surface-light rounded-[40px] p-8"}>
                <p className="font-display text-[22px] font-semibold">{p.name}</p>
                <p className="mt-4 font-display text-[48px] font-semibold tracking-[-0.04em]">
                  R$ {formatNumber(p.price, 2)}
                  <span className="text-[16px] font-medium opacity-70">/{p.period}</span>
                </p>
                <ul className="mt-6 flex flex-col gap-2 text-[15px]">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
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
