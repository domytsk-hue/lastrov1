"use client";

import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL, formatNumber } from "@/lib/format";
import { spring } from "@/design-system/motion";
import { usePrivacy } from "@/components/shared/ui/privacy";

/** Tween a number (for SVG or text that can't roll). */
export function useAnimatedNumber(value: number, { duration = 0.9, from }: { duration?: number; from?: number } = {}) {
  const reduce = useReducedMotion();
  const start = from ?? 0;
  const [display, setDisplay] = useState(reduce ? value : start);
  const prev = useRef(reduce ? value : start);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setDisplay });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return display;
}

/* ---------------- Rolling digits ---------------- */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function DigitColumn({ digit, delay }: { digit: number; delay: number }) {
  return (
    <span className="relative inline-block h-[1em] overflow-hidden align-top leading-none">
      {/* invisible sizer keeps the column exactly one digit wide */}
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={{ ...spring.soft, delay }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1em] leading-none">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * Renders a pre-formatted numeric string with each digit on its own rolling column.
 * Columns are keyed from the right, so 5.960 → 5.915 rolls only the digits that changed,
 * and 9.999 → 10.000 slides a new column in on the left.
 */
export function RollingText({ text, className, intro = true }: { text: string; className?: string; intro?: boolean }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(!intro);
  useEffect(() => {
    if (!intro) return;
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [intro]);

  if (reduce) return <span className={cn("tabular", className)}>{text}</span>;

  const chars = text.split("");
  return (
    <span className={cn("inline-flex items-start tabular leading-none", className)} aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          const isDigit = /\d/.test(ch);
          return (
            <motion.span
              key={`${fromRight}-${isDigit ? "d" : ch}`}
              layout="position"
              initial={{ opacity: 0, y: "0.3em" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "-0.3em" }}
              transition={spring.soft}
              className="inline-block"
            >
              {isDigit ? <DigitColumn digit={mounted ? Number(ch) : 0} delay={fromRight * 0.025} /> : ch}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

/* ---------------- Public components ---------------- */

type MoneySize = "display" | "hero" | "xl" | "lg" | "md" | "sm";

const MONEY: Record<MoneySize, { num: string; cur: string; cents: string }> = {
  display: { num: "text-[56px] tracking-[-0.045em] sm:text-[76px]", cur: "text-[20px] sm:text-[24px] mr-2 mt-[0.35em]", cents: "text-[26px] sm:text-[32px] mt-[0.12em]" },
  hero: { num: "text-[48px] tracking-[-0.04em] sm:text-[60px]", cur: "text-[18px] mr-1.5 mt-[0.3em]", cents: "text-[22px] sm:text-[26px] mt-[0.1em]" },
  xl: { num: "text-[40px] tracking-[-0.035em]", cur: "text-[16px] mr-1 mt-[0.25em]", cents: "text-[20px] mt-[0.08em]" },
  lg: { num: "text-[30px] tracking-[-0.03em]", cur: "text-[14px] mr-1 mt-[0.2em]", cents: "text-[16px] mt-[0.06em]" },
  md: { num: "text-[22px] tracking-[-0.02em]", cur: "text-[12px] mr-0.5 mt-[0.15em]", cents: "text-[14px]" },
  sm: { num: "text-[16px] tracking-[-0.01em]", cur: "text-[11px] mr-0.5", cents: "text-[12px]" },
};

/**
 * <AnimatedMoney /> — R$ small and raised, integer large and rolling, cents quiet.
 * Respects privacy mode and reduced motion.
 */
export function AnimatedMoney({
  value,
  size = "md",
  cents = true,
  sign = false,
  className,
}: {
  value: number;
  size?: MoneySize;
  cents?: boolean;
  sign?: boolean;
  className?: string;
}) {
  const privacy = usePrivacy();
  const s = MONEY[size];
  const negative = value < -0.004;
  const abs = Math.abs(value);
  const [int, dec] = formatNumber(abs, 2).split(",");
  const prefix = negative ? "−" : sign && value > 0.004 ? "+" : "";
  const label = privacy ? "Valor oculto" : formatBRL(value, { cents, sign });

  return (
    <span className={cn("inline-flex items-start font-display font-semibold whitespace-nowrap", className)} role="text" aria-label={label}>
      <span className={cn("font-sans font-medium opacity-70", s.cur)} aria-hidden>
        {prefix}R$
      </span>
      {privacy ? (
        <span className={cn(s.num, "leading-none tracking-[0.04em]")} aria-hidden>
          ••••
        </span>
      ) : (
        <>
          <RollingText text={int} className={s.num} />
          {cents && (
            <span className={cn(s.cents, "leading-none opacity-55")} aria-hidden>
              ,<RollingText text={dec} intro={false} />
            </span>
          )}
        </>
      )}
    </span>
  );
}

/** <AnimatedCounter /> — integers that roll, e.g. the Lastro score 68 → 74. */
export function AnimatedCounter({ value, from, className }: { value: number; from?: number; className?: string }) {
  const [shown, setShown] = useState(from ?? value);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(value), from !== undefined ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [value, from]);
  return (
    <span className={className} role="text" aria-label={String(value)}>
      <RollingText text={String(Math.round(shown))} intro={from === undefined} />
    </span>
  );
}

/** <AnimatedPercentage /> */
export function AnimatedPercentage({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  return (
    <span className={cn("inline-flex items-start", className)} role="text" aria-label={`${formatNumber(value * 100, decimals)}%`}>
      <RollingText text={formatNumber(value * 100, decimals)} />
      <span className="ml-0.5 text-[0.55em] leading-[1.4] opacity-70" aria-hidden>
        %
      </span>
    </span>
  );
}

/** Small inline money for sentences. */
export function Money({ value, cents = false, sign = false }: { value: number; cents?: boolean; sign?: boolean }) {
  const privacy = usePrivacy();
  return <span className="tabular whitespace-nowrap">{privacy ? "R$ ••••" : formatBRL(value, { cents, sign })}</span>;
}
