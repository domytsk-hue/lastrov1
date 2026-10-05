"use client";

/** Legacy names kept as aliases to the new animated primitives. */
import { cn } from "@/lib/cn";
import { AnimatedMoney, Money } from "./AnimatedNumber";

export { Money };

export function MoneyValue({
  value,
  size = "md",
  cents = true,
  sign = false,
  className,
  tone,
}: {
  value: number;
  size?: "display" | "hero" | "xl" | "lg" | "md" | "sm";
  cents?: boolean;
  animate?: boolean;
  sign?: boolean;
  className?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <AnimatedMoney
      value={value}
      size={size}
      cents={cents}
      sign={sign}
      className={cn(tone === "positive" && "text-mint-ink", tone === "negative" && "text-rose-ink", className)}
    />
  );
}
