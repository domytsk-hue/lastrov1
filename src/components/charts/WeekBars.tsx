"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { formatBRL, weekdayName } from "@/lib/format";
import { useUI } from "@/store/ui-store";

/** Seven-day spending bars. Today is highlighted; tap a bar to read its value. */
export function WeekBars({ data, today, height = 72 }: { data: { date: string; value: number }[]; today: string; height?: number }) {
  const reduce = useReducedMotion();
  const { privacy } = useUI();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const avg = data.slice(0, -1).reduce((s, d) => s + d.value, 0) / Math.max(1, data.length - 1);
  const shown = active ?? data.length - 1;

  return (
    <div className="w-full">
      <div className="relative" style={{ height }}>
        {/* average guide */}
        <div
          className="absolute inset-x-0 border-t border-dashed border-white/15"
          style={{ bottom: `${(avg / max) * 100}%` }}
          aria-hidden
        />
        <div className="absolute inset-0 flex items-end gap-1.5" role="list" aria-label="Gastos dos últimos 7 dias">
          {data.map((d, i) => {
            const isToday = d.date === today;
            const h = Math.max(4, (d.value / max) * height);
            return (
              <button
                key={d.date}
                role="listitem"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                aria-label={`${weekdayName(d.date)}: ${formatBRL(d.value)}`}
                className="relative flex h-full flex-1 items-end"
              >
                <motion.span
                  className="w-full rounded-[6px]"
                  style={{ background: isToday ? "var(--color-green)" : shown === i ? "rgba(244,246,248,0.55)" : "rgba(255,255,255,0.12)" }}
                  initial={reduce ? false : { height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5" aria-hidden>
        {data.map((d, i) => (
          <span key={d.date} className={`flex-1 text-center text-[10px] font-medium uppercase ${i === shown ? "text-off" : "text-muted"}`}>
            {weekdayName(d.date, true).slice(0, 3)}
          </span>
        ))}
      </div>
      <p className="sr-only">Média diária: {formatBRL(avg)}</p>
      {active !== null && (
        <p className="mt-1 text-center text-[12px] text-soft tabular" aria-live="polite">
          {weekdayName(data[active].date)} · {privacy ? "R$ ••••" : formatBRL(data[active].value)}
        </p>
      )}
    </div>
  );
}
