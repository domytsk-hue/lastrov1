"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The reserve as days of life protected. Each dot is one day; each column block is one month.
 * Far easier to feel than "52% complete".
 */
export function ReserveDays({ days, targetMonths }: { days: number; targetMonths: number }) {
  const reduce = useReducedMotion();
  const months = Math.max(targetMonths, Math.ceil(days / 30));
  return (
    <div
      className="grid gap-x-3 gap-y-3"
      style={{ gridTemplateColumns: `repeat(${Math.min(months, 6)}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`${days} de ${targetMonths * 30} dias protegidos`}
    >
      {Array.from({ length: months }, (_, m) => {
        const filledInMonth = Math.max(0, Math.min(30, days - m * 30));
        const beyondTarget = m >= targetMonths;
        return (
          <div key={m}>
            <div className="grid grid-cols-5 gap-[3px]">
              {Array.from({ length: 30 }, (_, d) => {
                const on = d < filledInMonth;
                return (
                  <motion.span
                    key={d}
                    className="aspect-square rounded-[3px]"
                    style={{ background: on ? (beyondTarget ? "#FFC234" : "#00D99B") : "rgba(255,255,255,0.07)" }}
                    initial={reduce || !on ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: on ? 0.55 + 0.45 * ((d + 1) / 30) : 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : (m * 30 + d) * 0.004 }}
                  />
                );
              })}
            </div>
            <p className="mt-1.5 text-center text-[10px] font-medium text-muted">{m + 1}º mês</p>
          </div>
        );
      })}
    </div>
  );
}
