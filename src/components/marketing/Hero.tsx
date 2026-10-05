"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ArrowUpRight, Plane } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ease } from "@/design-system/motion";
import { Orbit } from "@/components/shared/data-viz/Orbit";
import { AnimatedCounter, AnimatedMoney } from "@/components/shared/motion/AnimatedNumber";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";
import { ProgressPath } from "@/components/shared/surfaces/ProgressPath";
import { DEMO, DEMO_DIMENSIONS } from "./demo-data";
import { PrimaryCta, SecondaryLink, BalanceSurface } from "./ui";

/** Entrance timeline (seconds): nav 0 · headline .1 · copy .2 · CTA .3 · product .45 · orbit .6 · objects .75+ */
const T = { headline: 0.1, copy: 0.2, cta: 0.3, product: 0.45, orbit: 0.6, objects: 0.75 };

function enter(delay: number, reduce: boolean | null, from: { y?: number; scale?: number } = { y: 18 }) {
  return {
    initial: reduce ? false : { opacity: 0, y: from.y ?? 0, scale: from.scale ?? 1 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.8, ease: ease.out, delay },
  } as const;
}

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden px-5 pt-32 pb-16 sm:px-6 sm:pt-36 lg:px-10 lg:pb-28">
      <div className="mx-auto max-w-[1160px] text-center">
        <motion.h1
          id="hero-title"
          {...enter(T.headline, reduce)}
          className="mx-auto font-display text-[clamp(44px,6.6vw,88px)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance text-ink-900"
        >
          Veja sua vida financeira <br className="hidden md:block" />
          ganhar forma.
        </motion.h1>
        <motion.p {...enter(T.copy, reduce)} className="mx-auto mt-6 max-w-[34ch] text-[clamp(18px,1.9vw,22px)] leading-snug text-pretty text-ink-700">
          Do gasto de hoje ao patrimônio de amanhã. Tudo conectado, simples e visual.
        </motion.p>
        <motion.div {...enter(T.cta, reduce)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta />
          <SecondaryLink href="#produto">Conhecer o Lastro</SecondaryLink>
        </motion.div>
        <motion.p {...enter(T.cta + 0.1, reduce)} className="mt-5 text-[14px] text-ink-500">
          Conta criada em menos de um minuto · Sem cartão de crédito
        </motion.p>
      </div>

      <HeroMobileScene />
      <div className="hidden lg:block">
        <HeroProductScene />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Phones: one clear object, then four calm tiles — nothing overlaps   */
/* ------------------------------------------------------------------ */

function HeroMobileScene() {
  const reduce = useReducedMotion();
  const tile = "rounded-[26px] bg-white/85 p-4 shadow-[0_14px_34px_-22px_rgba(22,80,180,0.55),inset_0_1px_0_#fff]";
  return (
    <div className="mx-auto mt-12 max-w-[440px] lg:hidden">
      <p className="sr-only">
        Prévia do aplicativo Lastro com dados de exemplo: R$ 5.960 disponíveis, Lastro 74, gasto de hoje e a meta Japão em 56%.
      </p>
      <motion.div {...enter(T.product, reduce, { y: 22, scale: 0.98 })}>
        <BalanceSurface available={DEMO.available} income={DEMO.income} spent={DEMO.spent} saved={DEMO.saved} pace={DEMO.paceVsLastMonth} showActions={false} />
      </motion.div>

      <motion.ul {...enter(T.objects, reduce)} className="mt-3 grid grid-cols-2 gap-3 text-left" aria-hidden>
        <li className={tile}>
          <span className="flex items-center gap-1.5">
            <span className="live-dot size-1.5 rounded-full bg-mint" />
            <span className="text-[11px] font-bold tracking-[0.14em] text-ink-500 uppercase">Pulso hoje</span>
          </span>
          <AnimatedMoney value={DEMO.todaySpent} className="mt-2 text-ink-900" />
          <p className="mt-1 text-[13px] leading-tight font-medium text-ink-700">No ritmo</p>
        </li>
        <li className={tile}>
          <span className="text-[11px] font-bold tracking-[0.14em] text-ink-500 uppercase">Seu Lastro</span>
          <p className="mt-2 flex items-baseline gap-2">
            <AnimatedCounter value={DEMO.score} from={DEMO.previousScore} className="font-display text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink-900" />
            <span className="text-[13px] font-semibold text-mint-ink">+{DEMO.score - DEMO.previousScore}</span>
          </p>
          <p className="mt-1 text-[13px] leading-tight font-medium text-ink-700">Sólido</p>
        </li>
        <li className={tile}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-[#FF455D] uppercase">
            <Plane className="size-3.5" /> Japão
          </span>
          <p className="mt-2 font-display text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink-900">
            56<span className="text-[16px] text-ink-500">%</span>
          </p>
          <div className="mt-2">
            <ProgressPath value={DEMO.goal.saved / DEMO.goal.target} color={DEMO.goal.color} height={16} />
          </div>
        </li>
        <li className={tile}>
          <span className="text-[11px] font-bold tracking-[0.14em] text-ink-500 uppercase">Por dia</span>
          <p className="mt-2 font-display text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink-900">
            <span className="text-[16px] text-ink-500">≈ R$ </span>76
          </p>
          <p className="mt-1 text-[13px] leading-tight font-medium text-ink-700">livres até o fim do mês</p>
        </li>
      </motion.ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The product as a physical object                                    */
/* ------------------------------------------------------------------ */

/** Pointer parallax on desktop (fine pointer), scroll depth on touch. Off with reduced motion. */
function useDepth(ref: React.RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 20 });
  const sy = useSpring(py, { stiffness: 120, damping: 20 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  useEffect(() => {
    const isFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setFine(isFine);
    if (!isFine || reduce) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  return { sx, sy, scrollYProgress, mode: reduce ? "off" : fine ? "pointer" : "scroll" } as const;
}

type Depth = ReturnType<typeof useDepth>;

/** A layer of the scene: entrance + parallax of `px` pixels (2–8). */
function Layer({ depth, px, delay, className, children, from }: { depth: Depth; px: number; delay: number; className?: string; children: React.ReactNode; from?: { y?: number; scale?: number } }) {
  const reduce = useReducedMotion();
  const x = useTransform(depth.sx, (v: number) => (depth.mode === "pointer" ? v * px : 0));
  const yPointer = useTransform(depth.sy, (v: number) => v * px);
  const yScroll = useTransform(depth.scrollYProgress as MotionValue<number>, [0, 1], [px * 3, -px * 3]);
  const y = depth.mode === "pointer" ? yPointer : depth.mode === "scroll" ? yScroll : 0;
  return (
    <motion.div className={className} {...enter(delay, reduce, from ?? { y: 26, scale: 0.97 })}>
      <motion.div style={{ x, y }}>{children}</motion.div>
    </motion.div>
  );
}

export function HeroProductScene() {
  const ref = useRef<HTMLDivElement>(null);
  const depth = useDepth(ref);
  const [selected, setSelected] = useState<string | null>(null);
  const orbitData = DEMO_DIMENSIONS.map(({ id, label, value, color, colorTo }) => ({ id, label, value, color, colorTo }));

  return (
    <div ref={ref} className="relative mx-auto mt-14 max-w-[1100px] lg:mt-16 lg:h-[640px]">
      <p className="sr-only">
        Prévia do aplicativo Lastro com dados de exemplo: R$ 5.960 disponíveis, Lastro 74, gasto de hoje e a meta Japão em 56%.
      </p>
      {/* soft floor light under the object */}
      <div aria-hidden className="pointer-events-none absolute inset-x-[10%] bottom-0 h-40 rounded-full bg-electric/20 blur-3xl lg:bottom-6" />

      {/* Orbit — farthest layer */}
      <Layer depth={depth} px={3} delay={T.orbit} from={{ scale: 0.92 }} className="pointer-events-auto relative mx-auto -mb-12 w-[260px] sm:w-[300px] lg:absolute lg:top-0 lg:right-0 lg:mb-0 lg:w-[460px]">
        <div>
          <Orbit
            data={orbitData}
            selected={selected}
            onSelect={setSelected}
            ariaLabel="Lastro de exemplo: 74 de 100"
            center={
              <div className="flex flex-col items-center">
                <AnimatedCounter value={DEMO.score} from={DEMO.previousScore} className="font-display text-[44px] leading-none font-semibold tracking-[-0.05em] text-ink-900 lg:text-[60px]" />
                <span className="mt-1 text-[13px] font-semibold text-ink-700 lg:text-[15px]">Seu Lastro</span>
              </div>
            }
          />
        </div>
      </Layer>

      {/* Balance — the main object */}
      <Layer depth={depth} px={5} delay={T.product} className="relative z-10 mx-auto w-full max-w-[520px] lg:absolute lg:top-10 lg:left-6 lg:mx-0">
        <BalanceSurface available={DEMO.available} income={DEMO.income} spent={DEMO.spent} saved={DEMO.saved} pace={DEMO.paceVsLastMonth} />
      </Layer>

      {/* Pulse — floats above the balance */}
      <Layer depth={depth} px={7} delay={T.objects} className="relative z-20 mt-3 ml-auto w-[78%] max-w-[300px] sm:w-[300px] lg:absolute lg:top-[86px] lg:left-[500px] lg:mt-0">
        <FinancialSurface tone="light" radius="organic" className="p-5">
          <span className="flex items-center gap-2">
            <span className="live-dot size-2 rounded-full bg-mint" />
            <span className="eyebrow text-ink-500">Pulso · hoje</span>
          </span>
          <AnimatedMoney value={DEMO.todaySpent} size="lg" className="mt-3 text-ink-900" />
          <p className="mt-2 font-display text-[17px] leading-tight font-semibold text-ink-900">Hoje você está no ritmo.</p>
          <p className="mt-1 text-[13px] text-ink-500">Bem perto da sua média de segunda.</p>
        </FinancialSurface>
      </Layer>

      {/* Goal — front right */}
      <Layer depth={depth} px={8} delay={T.objects + 0.12} className="relative z-30 -mt-2 w-[86%] max-w-[330px] sm:w-[330px] lg:absolute lg:right-16 lg:bottom-6 lg:mt-0">
        <FinancialSurface tone="light" radius="organicR" className="p-5" style={{ background: "linear-gradient(155deg, #ffffff 0%, #FF455D1c 100%)" }}>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] text-[#FF455D] uppercase">
            <Plane className="size-4" /> Viagem Japão
          </p>
          <p className="mt-2 font-display text-[44px] leading-none font-semibold tracking-[-0.045em] text-ink-900">
            56<span className="text-[22px] text-ink-500">%</span>
          </p>
          <div className="mt-3">
            <ProgressPath value={DEMO.goal.saved / DEMO.goal.target} color={DEMO.goal.color} height={22} />
          </div>
          <p className="mt-2 text-[13px] text-ink-700">Chega em {DEMO.goal.eta}</p>
        </FinancialSurface>
      </Layer>

      {/* Budget capsule — nearest */}
      <Layer depth={depth} px={8} delay={T.objects + 0.24} className="relative z-30 mt-4 lg:absolute lg:bottom-20 lg:left-0 lg:mt-0">
        <div className="inline-flex items-center gap-3 rounded-full bg-white/90 py-2 pr-5 pl-2 shadow-[0_18px_40px_-18px_rgba(22,80,180,0.55),inset_0_1px_0_#fff] backdrop-blur">
          <span className="grid size-10 place-items-center rounded-full bg-mint text-midnight">
            <ArrowUpRight className="size-5" />
          </span>
          <span className="text-left">
            <span className="block font-display text-[18px] leading-tight font-semibold text-ink-900">≈ R$ 76 por dia</span>
            <span className="text-[13px] text-ink-500">livres até o fim do mês</span>
          </span>
        </div>
      </Layer>
    </div>
  );
}
