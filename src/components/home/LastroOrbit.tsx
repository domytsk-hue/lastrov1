"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { lastroLevel, lastroScore, type PillarId } from "@/lib/finance";
import { addDays } from "@/lib/format";
import { spring } from "@/lib/motion";
import { pillarStory } from "@/lib/stories";
import { useFinance } from "@/store/finance-store";
import { Orbit, type OrbitDatum } from "@/components/orbit/Orbit";
import { AnimatedCounter } from "@/components/ui/AnimatedNumber";
import { Capsule, TabbedSurface } from "@/components/surfaces/Surface";

/** Segment colours: a family of blues, with mint for the foundation (reserve). */
const COLORS: Record<PillarId, [string, string]> = {
  reserva: ["#0FB98F", "#18E0AE"],
  orcamento: ["#173D91", "#3678F5"],
  investimentos: ["#2459D6", "#65B7F2"],
  metas: ["#3678F5", "#8CCBFF"],
  fluxo: ["#0B2560", "#2C63D8"],
  dividas: ["#4F6A8E", "#9DB4D3"],
};

const ORDER: PillarId[] = ["reserva", "fluxo", "orcamento", "metas", "investimentos", "dividas"];

/** LASTRO ORBIT — the user's financial foundation as a living circular system. */
export function LastroOrbit() {
  const { state, today } = useFinance();
  const [selected, setSelected] = useState<PillarId | null>(null);
  const { score, pillars } = useMemo(() => lastroScore(state, today), [state, today]);
  const prev = useMemo(() => lastroScore(state, addDays(today, -7)).score, [state, today]);
  const level = lastroLevel(score);

  const data: OrbitDatum[] = ORDER.map((id) => {
    const p = pillars.find((x) => x.id === id)!;
    return { id, label: p.label, value: p.value, color: COLORS[id][0], colorTo: COLORS[id][1] };
  });
  const story = selected ? pillarStory(state, today, selected) : null;
  const pillar = selected ? pillars.find((p) => p.id === selected)! : null;

  return (
    <section aria-labelledby="orbit-title" className="relative">
      <h2 id="orbit-title" className="sr-only">
        Seu Lastro
      </h2>
      <Orbit
        data={data}
        selected={selected}
        onSelect={(id) => setSelected(id as PillarId | null)}
        ariaLabel={`Seu Lastro: ${score} de 100. Toque em uma dimensão para ver detalhes.`}
        center={
          <AnimatePresence mode="wait" initial={false}>
            {story && pillar ? (
              <motion.button
                key={pillar.id}
                onClick={() => setSelected(null)}
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={spring.snappy}
                aria-label="Voltar ao Lastro"
              >
                <span className="eyebrow text-[11px] text-ink-500">{pillar.label}</span>
                <span className="mt-1 font-display text-[40px] leading-none font-semibold tracking-[-0.04em] text-ink-900 sm:text-[46px]">{story.big}</span>
                <span className="mt-1.5 max-w-[150px] text-[13px] leading-tight font-medium text-ink-500">{story.unit}</span>
              </motion.button>
            ) : (
              <motion.div key="score" className="flex flex-col items-center" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={spring.snappy}>
                <AnimatedCounter value={score} from={prev} className="font-display text-[64px] leading-none font-semibold tracking-[-0.05em] text-ink-900 sm:text-[72px]" />
                <span className="mt-1 text-[15px] font-semibold text-ink-700">Seu Lastro</span>
                <span className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-ink-500">
                  {score > prev && (
                    <span className="flex items-center text-mint-ink">
                      <ArrowUpRight className="size-3.5" />+{score - prev}
                    </span>
                  )}
                  {score > prev ? " · " : ""}
                  {level.name}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      {/* Contextual card: grows out of the orbit when a dimension is selected */}
      <AnimatePresence initial={false}>
        {story && pillar && (
          <motion.div
            key={pillar.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.soft}
            className="relative z-10 -mt-4"
          >
            <TabbedSurface
              tab={
                <>
                  <span className="size-2 rounded-full" style={{ background: COLORS[pillar.id][1] }} />
                  {pillar.label}
                </>
              }
              tabRight={story.delta && <Capsule tone={story.delta.positive ? "mint" : "amber"}>{story.delta.text}</Capsule>}
            >
              <p className="font-display text-[22px] leading-snug font-semibold tracking-[-0.02em]">{story.sentence}</p>
              <Link href={story.href} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-midnight pr-4 pl-5 text-[14px] font-semibold text-white">
                {story.cta} <ArrowRight className="size-4" />
              </Link>
            </TabbedSurface>
          </motion.div>
        )}
      </AnimatePresence>
      {!selected && <p className="-mt-2 text-center text-[13px] text-ink-500">Toque em uma dimensão para entender seu Lastro.</p>}
    </section>
  );
}
