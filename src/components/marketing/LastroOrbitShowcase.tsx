"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { LastroOrbitView } from "@/components/shared/data-viz/LastroOrbitView";
import { DEMO, DEMO_DIMENSIONS } from "./demo-data";
import { Section, SectionHeading, WhenSeen } from "./motion";

/** Order of the guided tour — the dimensions people ask about first. */
const TOUR = ["reserva", "metas", "fluxo", "orcamento", "investimentos"];

/**
 * The Lastro Orbit — the same component the app renders, here with demo data.
 * In view, it gives a short guided tour (one dimension every few seconds); the moment the
 * visitor touches it, the tour stops and the orbit is theirs.
 */
export function LastroOrbitShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!inView || touched || reduce) return;
    let i = 0;
    const first = window.setTimeout(() => setSelected(TOUR[0]), 1400);
    const id = window.setInterval(() => {
      i = (i + 1) % (TOUR.length + 1);
      setSelected(i === TOUR.length ? null : TOUR[i]);
    }, 2800);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [inView, touched, reduce]);

  return (
    <Section labelledBy="orbit-title" className="overflow-hidden">
      <SectionHeading id="orbit-title" align="center" kicker="Seu Lastro" title="Uma visão da sua vida financeira." lead="Reserva, fluxo, orçamento, metas, investimentos e dívidas — em um só desenho que você lê de relance." />

      <div ref={ref} className="mx-auto mt-12 max-w-[520px] lg:mt-16">
        <WhenSeen minHeight={520}>
          <LastroOrbitView
            dimensions={DEMO_DIMENSIONS}
            score={DEMO.score}
            previousScore={DEMO.previousScore}
            levelName="Sólido"
            selected={selected}
            onSelect={(id) => {
              setTouched(true);
              setSelected(id);
            }}
            hint="Toque em uma dimensão."
          />
        </WhenSeen>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2" role="group" aria-label="Explorar dimensões do Lastro">
        {DEMO_DIMENSIONS.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setTouched(true);
              setSelected(selected === d.id ? null : d.id);
            }}
            aria-pressed={selected === d.id}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors",
              selected === d.id ? "bg-midnight text-white" : "bg-white/70 text-ink-700 hover:bg-white",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: d.colorTo ?? d.color }} />
            {d.label}
          </button>
        ))}
      </div>
    </Section>
  );
}
