"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Flag, HandCoins, ShieldCheck, Sparkles, Star, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { formatCompactBRL, monthName } from "@/lib/format";
import type { Milestone, NetWorthPoint } from "@/lib/types";
import { useUI } from "@/store/ui-store";

const KIND_ICON: Record<Milestone["kind"], typeof Flag> = {
  investment: TrendingUp,
  reserve: ShieldCheck,
  debt: HandCoins,
  goal: Target,
  record: Star,
  savings: Sparkles,
};

/**
 * The financial timeline — your money told as a story.
 * Months are stations; milestones are the moments worth remembering.
 */
export function FinancialTimeline({ series, milestones, record }: { series: NetWorthPoint[]; milestones: Milestone[]; record: boolean }) {
  const reduce = useReducedMotion();
  const { privacy } = useUI();
  const scroller = useRef<HTMLDivElement>(null);

  const stations = useMemo(() => {
    const max = Math.max(...series.map((p) => p.value));
    const min = Math.min(...series.map((p) => p.value));
    return series.map((p, i) => ({
      ...p,
      h: 0.25 + 0.75 * ((p.value - min) / Math.max(1, max - min)),
      isLast: i === series.length - 1,
      newYear: i === 0 || p.month.endsWith("-01"),
      events: milestones.filter((m) => m.date.startsWith(p.month)),
    }));
  }, [series, milestones]);

  // Start scrolled to "now".
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div ref={scroller} className="-mx-5 overflow-x-auto px-5 pb-2 no-scrollbar sm:-mx-6 sm:px-6" tabIndex={0} aria-label="Linha do tempo financeira">
      <ol className="flex min-w-max items-end gap-1">
        {stations.map((s, i) => (
          <li key={s.month} className="flex w-[92px] flex-col items-center">
            {/* milestones above the station */}
            <div className="flex min-h-[86px] w-full flex-col justify-end gap-1.5 pb-2">
              {[...(s.isLast && record ? [{ id: "rec", title: "Recorde de patrimônio", kind: "record", date: "" } satisfies Milestone] : []), ...s.events].map((m) => {
                const Icon = KIND_ICON[m.kind];
                return (
                  <motion.div
                    key={m.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[12px] bg-yellow/10 px-2 py-1.5 text-[11px] leading-tight font-medium text-yellow-light"
                  >
                    <Icon className="mb-0.5 size-3.5 text-yellow" />
                    {m.title}
                  </motion.div>
                );
              })}
            </div>
            {/* the station bar */}
            <div className="flex h-24 w-full items-end justify-center">
              <motion.div
                className="w-10 rounded-t-[12px]"
                style={{
                  background: s.isLast ? "linear-gradient(180deg,#00D99B,#00D99B33)" : `linear-gradient(180deg, rgba(91,140,255,${0.35 + s.h * 0.4}), rgba(91,140,255,0.05))`,
                }}
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${s.h * 100}%` }}
                transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="w-full border-t border-white/10 pt-2 text-center">
              <p className={`text-[11px] font-semibold tracking-[0.08em] uppercase ${s.isLast ? "text-green" : "text-muted"}`}>
                {s.isLast ? "Hoje" : monthName(s.month, true)}
                {s.newYear && !s.isLast && <span className="ml-1 text-soft">{s.month.slice(2, 4)}</span>}
              </p>
              <p className="mt-0.5 text-[13px] font-semibold tabular text-off">{privacy ? "••••" : formatCompactBRL(s.value).replace("R$ ", "")}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
