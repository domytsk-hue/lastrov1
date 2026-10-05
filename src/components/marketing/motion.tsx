"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { ease } from "@/design-system/motion";

/**
 * Marketing motion helpers. Everything is viewport-driven (IntersectionObserver via
 * framer's useInView) and transform/opacity only; reduced motion renders the final state.
 */

/** True once the element has entered the viewport. */
export function useSeen<T extends Element>(amount = 0.35) {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, amount });
  return [ref, seen] as const;
}

/** Text that settles into place — small and calm. */
export function Rise({ children, delay = 0, className, as = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "p" | "h2" | "h3" | "span" }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, ease: ease.out, delay }}
    >
      {children}
    </Comp>
  );
}

/**
 * Mounts its children only once in view, so the product components' own entrance
 * animations (digits rolling, rings filling, paths drawing) play when the visitor sees them.
 * A sized placeholder keeps layout stable before that.
 */
export function WhenSeen({ children, className, minHeight, amount = 0.3 }: { children: React.ReactNode; className?: string; minHeight?: number; amount?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>(amount);
  return (
    <div ref={ref} className={className} style={!seen && minHeight ? { minHeight } : undefined}>
      {seen ? children : null}
    </div>
  );
}

/** Section heading pattern: small kicker + large headline + optional short line. */
export function SectionHeading({
  id,
  kicker,
  title,
  lead,
  align = "left",
  className,
  tone = "dark",
}: {
  id?: string;
  kicker?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div className={cn(align === "center" && "mx-auto text-center", "max-w-3xl", className)}>
      {kicker && (
        <Rise as="p" className={cn("eyebrow mb-4", tone === "dark" ? "text-electric" : "text-mint")}>
          {kicker}
        </Rise>
      )}
      <Rise
        as="h2"
        delay={0.05}
        className={cn(
          "font-display text-[clamp(34px,5.4vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance",
          tone === "dark" ? "text-ink-900" : "text-white",
        )}
      >
        <span id={id}>{title}</span>
      </Rise>
      {lead && (
        <Rise as="p" delay={0.12} className={cn("mt-5 text-[clamp(17px,1.6vw,20px)] leading-relaxed text-pretty", tone === "dark" ? "text-ink-700" : "text-white/75", align === "center" && "mx-auto max-w-xl")}>
          {lead}
        </Rise>
      )}
    </div>
  );
}

/** Standard section frame: generous vertical rhythm, same max width as the product canvas. */
export function Section({ id, children, className, labelledBy }: { id?: string; children: React.ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("relative scroll-mt-28 px-4 py-24 sm:px-6 lg:px-10 lg:py-36", className)}>
      <div className="mx-auto w-full max-w-[1160px]">{children}</div>
    </section>
  );
}
