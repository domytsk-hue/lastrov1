"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { insights } from "@/lib/finance";
import { spring } from "@/lib/motion";
import type { FinancialInsight } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { TabbedSurface } from "@/components/surfaces/Surface";

type Story = FinancialInsight & { teaser?: string };

/**
 * <InsightStory /> — one editorial insight at a time. Swipe (or use the dots) for the next.
 * A pattern change can arrive as a teaser that reveals itself on tap: curiosity, not pressure.
 */
export function InsightStory({ className }: { className?: string }) {
  const { state, today } = useFinance();
  const stories = useMemo<Story[]>(() => {
    const list = insights(state, today);
    const change = list.find((i) => i.id === "delivery" || i.id.startsWith("less-") || i.id.startsWith("more-"));
    if (!change) return list;
    return [{ ...change, teaser: "Uma coisa mudou no seu padrão este mês." }, ...list.filter((i) => i !== change)];
  }, [state, today]);

  const [[index, dir], setPage] = useState<[number, number]>([0, 0]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  if (!stories.length) return null;
  const i = ((index % stories.length) + stories.length) % stories.length;
  const story = stories[i];
  const go = (d: number) => setPage(([n]) => [n + d, d]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 50 || info.velocity.x > 400) go(-1);
  };

  const showTeaser = story.teaser && !revealed[story.id];

  return (
    <TabbedSurface
      color="navy"
      className={className}
      aria-label="Insight do dia"
      tab={
        <>
          <Sparkles className="size-4 text-mint" />
          Insight
        </>
      }
      tabRight={
        <span className="rounded-full bg-midnight/10 px-3 py-1 text-[13px] font-semibold text-ink-700 tabular">
          {i + 1} / {stories.length}
        </span>
      }
      bodyClassName="overflow-hidden"
    >
      <div className="relative min-h-[172px]">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={story.id + (showTeaser ? "-t" : "")}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d >= 0 ? 60 : -60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d >= 0 ? -60 : 60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.soft}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="cursor-grab touch-pan-y active:cursor-grabbing"
            aria-live="polite"
          >
            {showTeaser ? (
              <>
                <p className="font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[30px]">{story.teaser}</p>
                <button
                  onClick={() => setRevealed((r) => ({ ...r, [story.id]: true }))}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-mint pr-4 pl-5 text-[14px] font-semibold text-midnight"
                >
                  Ver o quê <ArrowRight className="size-4" />
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-[30px]">{story.title}</p>
                {story.body && <p className="mt-3 text-[15px] text-white/70">{story.body}</p>}
                {story.action && (
                  <Link href={story.action.href} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-mint">
                    {story.action.label} <ArrowRight className="size-4" />
                  </Link>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-5 flex items-center gap-1.5" role="tablist" aria-label="Escolher insight">
        {stories.map((s, n) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={n === i}
            aria-label={`Insight ${n + 1}`}
            onClick={() => setPage([n, n > i ? 1 : -1])}
            className="grid h-6 place-items-center"
          >
            <motion.span layout className={cn("block h-1.5 rounded-full", n === i ? "w-6 bg-white" : "w-1.5 bg-white/30")} transition={spring.snappy} />
          </button>
        ))}
      </div>
    </TabbedSurface>
  );
}
