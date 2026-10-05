"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { CreditCard, FileSpreadsheet, Landmark, Repeat, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMO } from "./demo-data";
import { BalanceSurface } from "./ui";

interface Fragment {
  label: string;
  detail: string;
  icon: LucideIcon;
  x: number;
  y: number;
  r: number;
  /** Phone layout: two loose columns that fit 360px screens. */
  mx: number;
  my: number;
}

/** Where money usually lives: six places that never talk to each other. */
const FRAGMENTS: Fragment[] = [
  { label: "Conta", detail: "R$ 5.960", icon: Landmark, x: -390, y: -170, r: -6, mx: -84, my: -190 },
  { label: "Cartão", detail: "Fatura R$ 2.450", icon: CreditCard, x: 360, y: -200, r: 5, mx: 84, my: -128 },
  { label: "Planilha", detail: "aba “gastos_v3”", icon: FileSpreadsheet, x: -430, y: 110, r: 4, mx: -84, my: -62 },
  { label: "Investimentos", detail: "R$ 28.450", icon: TrendingUp, x: 410, y: 100, r: -4, mx: 84, my: 2 },
  { label: "Metas", detail: "num caderno", icon: Target, x: -190, y: 240, r: -3, mx: -84, my: 68 },
  { label: "Assinaturas", detail: "R$ 189/mês", icon: Repeat, x: 210, y: 250, r: 6, mx: 84, my: 132 },
];

/**
 * "Seu dinheiro está espalhado." → "O Lastro conecta tudo."
 * Scroll-linked on purpose: the transformation IS the explanation. Transform/opacity only.
 */
export function FinancialFragmentation() {
  const reduce = useReducedMotion();
  if (reduce) return <StaticFragmentation />;
  return <ScrollFragmentation />;
}

function ScrollFragmentation() {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const fit = () => {
      setK(Math.min(1, Math.max(0.42, window.innerWidth / 1180)));
      setNarrow(window.innerWidth < 640);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Opacity uses function transforms on purpose: framer can hand range-based opacity to the
  // browser's native ScrollTimeline, which ignores the section offset and desyncs the crossfade.
  const titleA = useTransform(scrollYProgress, (v) => 1 - ramp(v, 0.36, 0.46));
  const titleAy = useTransform(scrollYProgress, [0.36, 0.46], [0, -24]);
  const titleB = useTransform(scrollYProgress, (v) => ramp(v, 0.52, 0.62));
  const titleBy = useTransform(scrollYProgress, [0.52, 0.62], [24, 0]);
  const merged = useTransform(scrollYProgress, (v) => ramp(v, 0.52, 0.7));
  const mergedScale = useTransform(scrollYProgress, [0.5, 0.72], [0.82, 1]);

  return (
    <section aria-labelledby="frag-a" ref={ref} className="relative h-[260vh]">
      <div className="sticky top-0 flex h-dvh flex-col items-center overflow-hidden px-4 pt-[clamp(96px,15vh,150px)]">
        <div className="relative z-10 grid place-items-center text-center [grid-template-areas:'t']">
          <motion.h2 id="frag-a" style={{ opacity: titleA, y: titleAy }} className="max-w-[16ch] font-display text-[clamp(34px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance text-ink-900 [grid-area:t]">
            Seu dinheiro está espalhado.
          </motion.h2>
          <motion.p aria-hidden style={{ opacity: titleB, y: titleBy }} className="max-w-[16ch] font-display text-[clamp(34px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance text-ink-900 [grid-area:t]">
            O Lastro conecta tudo.
          </motion.p>
        </div>
        <span className="sr-only">O Lastro conecta tudo: conta, cartão, planilha, investimentos, metas e assinaturas em um só lugar.</span>

        {/* the stage: fragments orbit its center, then become one surface there */}
        <div className="pointer-events-none absolute inset-x-0 top-[calc(clamp(96px,15vh,150px)+clamp(100px,16vh,170px))] bottom-0 grid place-items-center" aria-hidden>
          {FRAGMENTS.map((f, i) => (
            <FragmentChip key={f.label} f={f} k={k} narrow={narrow} progress={scrollYProgress} index={i} />
          ))}

          <motion.div style={{ opacity: merged, scale: mergedScale }} className="w-[min(460px,calc(100vw-32px))]">
            <BalanceSurface available={DEMO.available} income={DEMO.income} spent={DEMO.spent} saved={DEMO.saved} showActions={false} compact />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FragmentChip({ f, k, narrow, progress, index }: { f: Fragment; k: number; narrow: boolean; progress: MotionValue<number>; index: number }) {
  const start = 0.08 + index * 0.025;
  const fx = narrow ? f.mx : f.x * k;
  const fy = narrow ? f.my : f.y * k * 0.8;
  const x = useTransform(progress, [0, start, 0.56], [fx * 1.08, fx, 0]);
  const y = useTransform(progress, [0, start, 0.56], [fy * 1.08, fy, 0]);
  const rotate = useTransform(progress, [start, 0.56], [f.r, 0]);
  const scale = useTransform(progress, [start, 0.56], [1, 0.55]);
  const opacity = useTransform(progress, (v) => 1 - ramp(v, 0.42, 0.52));
  const Icon = f.icon;
  return (
    <motion.div style={{ x, y, rotate, scale, opacity }} className="absolute">
      <div className="flex items-center gap-3 rounded-full bg-white/90 py-2 pr-5 pl-2 max-sm:scale-[0.8] shadow-[0_18px_40px_-18px_rgba(22,80,180,0.55),inset_0_1px_0_#fff]">
        <span className="grid size-10 place-items-center rounded-full bg-ice text-deep">
          <Icon className="size-5" />
        </span>
        <span>
          <span className="block text-[15px] leading-tight font-semibold text-ink-900">{f.label}</span>
          <span className="text-[13px] text-ink-500">{f.detail}</span>
        </span>
      </div>
    </motion.div>
  );
}

/** 0 before `a`, 1 after `b`, linear in between. */
function ramp(v: number, a: number, b: number) {
  return Math.min(1, Math.max(0, (v - a) / (b - a)));
}

/** Reduced motion: the same story, told without movement. */
function StaticFragmentation() {
  return (
    <section aria-labelledby="frag-static" className="px-4 py-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1160px] text-center">
        <h2 id="frag-static" className="mx-auto max-w-[16ch] font-display text-[clamp(34px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em] text-ink-900">
          Seu dinheiro está espalhado.
        </h2>
        <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
          {FRAGMENTS.map((f) => (
            <li key={f.label} className="flex items-center gap-3 rounded-full bg-white/90 py-2 pr-5 pl-2">
              <span className="grid size-10 place-items-center rounded-full bg-ice text-deep">
                <f.icon className="size-5" />
              </span>
              <span className="text-left">
                <span className="block text-[15px] font-semibold text-ink-900">{f.label}</span>
                <span className="text-[13px] text-ink-500">{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-16 font-display text-[clamp(34px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em] text-ink-900">O Lastro conecta tudo.</p>
        <div className="mx-auto mt-10 max-w-[460px] text-left">
          <BalanceSurface available={DEMO.available} income={DEMO.income} spent={DEMO.spent} saved={DEMO.saved} showActions={false} compact />
        </div>
      </div>
    </section>
  );
}
