"use client";

import { cn } from "@/lib/cn";
import { formatBRL, formatNumber } from "@/lib/format";
import { useUI } from "@/store/ui-store";
import { useAnimatedNumber } from "./AnimatedNumber";

type Size = "hero" | "xl" | "lg" | "md" | "sm";

const SIZES: Record<Size, { num: string; cur: string; cents: string }> = {
  hero: { num: "text-[52px] leading-[0.95] tracking-[-0.04em] sm:text-[64px]", cur: "text-[20px] mr-1.5 translate-y-[-0.85em]", cents: "text-[24px] tracking-[-0.02em]" },
  xl: { num: "text-[40px] leading-none tracking-[-0.035em]", cur: "text-[16px] mr-1 translate-y-[-0.75em]", cents: "text-[20px]" },
  lg: { num: "text-[28px] leading-none tracking-[-0.03em]", cur: "text-[14px] mr-1 translate-y-[-0.45em]", cents: "text-[16px]" },
  md: { num: "text-[20px] leading-none tracking-[-0.02em]", cur: "text-[12px] mr-0.5 translate-y-[-0.3em]", cents: "text-[14px]" },
  sm: { num: "text-[15px] leading-none tracking-[-0.01em]", cur: "text-[11px] mr-0.5", cents: "text-[12px]" },
};

/**
 * The canonical way to show money in Lastro: R$ small and raised, integer large,
 * cents de-emphasised. Animates between values and respects privacy mode.
 */
export function MoneyValue({
  value,
  size = "md",
  cents = true,
  animate = true,
  sign = false,
  className,
  tone,
}: {
  value: number;
  size?: Size;
  cents?: boolean;
  animate?: boolean;
  sign?: boolean;
  className?: string;
  tone?: "positive" | "negative";
}) {
  const { privacy } = useUI();
  const animated = useAnimatedNumber(value, { duration: size === "hero" ? 1.1 : 0.8 });
  const v = animate ? animated : value;
  const s = SIZES[size];
  const negative = v < -0.004;
  const abs = Math.abs(v);
  const int = Math.floor(abs + 1e-9);
  const dec = Math.round((abs - int) * 100);
  const intStr = formatNumber(dec === 100 ? int + 1 : int, 0);
  const decStr = String(dec === 100 ? 0 : dec).padStart(2, "0");
  const prefix = negative ? "−" : sign && v > 0.004 ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display font-semibold tabular whitespace-nowrap",
        tone === "positive" && "text-green",
        tone === "negative" && "text-coral-light",
        className,
      )}
      aria-label={privacy ? "Valor oculto" : formatBRL(value, { cents, sign })}
    >
      <span aria-hidden className="inline-flex items-baseline">
        <span className={cn("font-sans font-medium opacity-60", s.cur, "inline-block")}>{prefix}R$</span>
        {privacy ? (
          <span className={cn(s.num, "tracking-[0.05em]")}>••••</span>
        ) : (
          <>
            <span className={s.num}>{intStr}</span>
            {cents && <span className={cn(s.cents, "opacity-55")}>,{decStr}</span>}
          </>
        )}
      </span>
    </span>
  );
}

/** Inline text money (for sentences). Respects privacy mode. */
export function Money({ value, cents = false, sign = false }: { value: number; cents?: boolean; sign?: boolean }) {
  const { privacy } = useUI();
  return <span className="tabular whitespace-nowrap">{privacy ? "R$ ••••" : formatBRL(value, { cents, sign })}</span>;
}
