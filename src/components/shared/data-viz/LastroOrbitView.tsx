"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { spring } from "@/design-system/motion";
import { AnimatedCounter } from "@/components/shared/motion/AnimatedNumber";
import { Capsule, TabbedSurface } from "@/components/shared/surfaces/Surface";
import { Orbit } from "./Orbit";

/** One dimension of the Lastro, already phrased for people. Plain data: real or demo. */
export interface LastroDimension {
  id: string;
  label: string;
  /** 0..1 health of the dimension. */
  value: number;
  color: string;
  colorTo?: string;
  story: {
    /** Big value for the center, e.g. "3,1". */
    big: string;
    /** Unit under it, e.g. "meses protegidos". */
    unit: string;
    sentence: string;
    delta?: { text: string; positive: boolean };
    /** Optional deep link (product). Omit in demos. */
    href?: string;
    cta?: string;
  };
}

/**
 * <LastroOrbitView /> — the signature Lastro visualization, purely presentational.
 * The product feeds it the user's real data (components/product/home/LastroOrbit);
 * the marketing site can feed it demo data.
 */
export function LastroOrbitView({
  dimensions,
  score,
  previousScore = score,
  levelName,
  selected: selectedProp,
  onSelect,
  hint = "Toque em uma dimensão para entender seu Lastro.",
}: {
  dimensions: LastroDimension[];
  score: number;
  previousScore?: number;
  levelName: string;
  /** Optional controlled selection (e.g. a guided tour). Uncontrolled when omitted. */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  hint?: string;
}) {
  const [internal, setInternal] = useState<string | null>(null);
  const controlled = selectedProp !== undefined;
  const selected = controlled ? selectedProp : internal;
  const setSelected = (id: string | null) => {
    if (!controlled) setInternal(id);
    onSelect?.(id);
  };
  const sel = selected ? (dimensions.find((d) => d.id === selected) ?? null) : null;
  const data = dimensions.map(({ id, label, value, color, colorTo }) => ({ id, label, value, color, colorTo }));

  return (
    <section aria-labelledby="orbit-title" className="relative">
      <h2 id="orbit-title" className="sr-only">
        Seu Lastro
      </h2>
      <Orbit
        data={data}
        selected={selected}
        onSelect={setSelected}
        ariaLabel={`Seu Lastro: ${score} de 100. Toque em uma dimensão para ver detalhes.`}
        center={
          <AnimatePresence mode="wait" initial={false}>
            {sel ? (
              <motion.button
                key={sel.id}
                onClick={() => setSelected(null)}
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={spring.snappy}
                aria-label="Voltar ao Lastro"
              >
                <span className="eyebrow text-[11px] text-ink-500">{sel.label}</span>
                <span className="mt-1 font-display text-[40px] leading-none font-semibold tracking-[-0.04em] text-ink-900 sm:text-[46px]">{sel.story.big}</span>
                <span className="mt-1.5 max-w-[150px] text-[13px] leading-tight font-medium text-ink-500">{sel.story.unit}</span>
              </motion.button>
            ) : (
              <motion.div key="score" className="flex flex-col items-center" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={spring.snappy}>
                <AnimatedCounter value={score} from={previousScore} className="font-display text-[64px] leading-none font-semibold tracking-[-0.05em] text-ink-900 sm:text-[72px]" />
                <span className="mt-1 text-[15px] font-semibold text-ink-700">Seu Lastro</span>
                <span className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-ink-500">
                  {score > previousScore && (
                    <span className="flex items-center text-mint-ink">
                      <ArrowUpRight className="size-3.5" />+{score - previousScore}
                    </span>
                  )}
                  {score > previousScore ? " · " : ""}
                  {levelName}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      {/* Contextual card: grows out of the orbit when a dimension is selected */}
      <AnimatePresence initial={false}>
        {sel && (
          <motion.div
            key={sel.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.soft}
            className="relative z-10 -mt-4"
          >
            <TabbedSurface
              tab={
                <>
                  <span className="size-2 rounded-full" style={{ background: sel.colorTo ?? sel.color }} />
                  {sel.label}
                </>
              }
              tabRight={sel.story.delta && <Capsule tone={sel.story.delta.positive ? "mint" : "amber"}>{sel.story.delta.text}</Capsule>}
            >
              <p className="font-display text-[22px] leading-snug font-semibold tracking-[-0.02em]">{sel.story.sentence}</p>
              {sel.story.href && sel.story.cta && (
                <Link href={sel.story.href} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-midnight pr-4 pl-5 text-[14px] font-semibold text-white">
                  {sel.story.cta} <ArrowRight className="size-4" />
                </Link>
              )}
            </TabbedSurface>
          </motion.div>
        )}
      </AnimatePresence>
      {!selected && hint && <p className="-mt-2 text-center text-[13px] text-ink-500">{hint}</p>}
    </section>
  );
}
