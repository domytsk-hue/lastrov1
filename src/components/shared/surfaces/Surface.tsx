"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/design-system/motion";

/* ------------------------------------------------------------------ */
/* Pointer helpers                                                     */
/* ------------------------------------------------------------------ */

/** True on devices with a precise pointer and no reduced-motion preference. */
export function useFinePointer() {
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);
  return fine && !reduce;
}

/** Cursor-following light: sets --mx/--my on the element (desktop only). */
function useSurfaceLight(enabled: boolean) {
  return useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    },
    [enabled],
  );
}

/* ------------------------------------------------------------------ */
/* FinancialSurface                                                    */
/* ------------------------------------------------------------------ */

export type SurfaceTone = "hero" | "light" | "navy";

const TONE: Record<SurfaceTone, string> = {
  hero: "surface-hero",
  light: "surface-light text-ink-900",
  navy: "surface-navy",
};

const RADIUS = {
  xl: "rounded-[40px]",
  lg: "rounded-[36px]",
  md: "rounded-[28px]",
  organic: "rounded-[36px_36px_36px_16px]",
  organicR: "rounded-[16px_36px_36px_36px]",
} as const;

type SurfaceProps = Omit<HTMLMotionProps<"div">, "ref" | "children"> & {
  children?: React.ReactNode;
  tone?: SurfaceTone;
  radius?: keyof typeof RADIUS;
  /** Hover lift + light that follows the cursor (desktop only). */
  interactive?: boolean;
};

export const FinancialSurface = forwardRef<HTMLDivElement, SurfaceProps>(function FinancialSurface(
  { tone = "light", radius = "lg", interactive = false, className, children, onPointerMove, style, ...rest },
  ref,
) {
  const fine = useFinePointer();
  const light = useSurfaceLight(interactive && fine);
  return (
    <motion.div
      ref={ref}
      className={cn("group/surface relative isolate overflow-hidden", TONE[tone], RADIUS[radius], className)}
      whileHover={interactive && fine ? { y: -2, scale: 1.005 } : undefined}
      transition={spring.soft}
      onPointerMove={(e) => {
        light(e);
        onPointerMove?.(e);
      }}
      style={style}
      {...rest}
    >
      {interactive && fine && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/surface:opacity-100"
          style={{
            background: `radial-gradient(420px circle at var(--mx, 0%) var(--my, 0%), ${tone === "light" ? "rgba(140,203,255,0.18)" : "rgba(255,255,255,0.12)"}, transparent 60%)`,
          }}
        />
      )}
      {children}
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/* TabbedSurface — a body with a connected tab (concave notch joint)   */
/* ------------------------------------------------------------------ */

const TAB_COLORS = {
  light: { bg: "#F4FAFF", text: "text-ink-900" },
  ice: { bg: "#BFE2FF", text: "text-ink-900" },
  navy: { bg: "#0B2560", text: "text-white" },
  blue: { bg: "#4E98F7", text: "text-white" },
} as const;

export function TabbedSurface({
  tab,
  tabRight,
  color = "light",
  className,
  bodyClassName,
  children,
  as: As = "section",
  ...aria
}: {
  tab: React.ReactNode;
  tabRight?: React.ReactNode;
  color?: keyof typeof TAB_COLORS;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  as?: "section" | "div" | "article";
} & Pick<React.HTMLAttributes<HTMLElement>, "aria-label" | "aria-labelledby" | "id">) {
  const c = TAB_COLORS[color];
  return (
    <As className={cn("relative drop-shadow-[0_18px_30px_rgba(22,80,180,0.16)]", className)} {...aria}>
      <div className="flex items-end justify-between">
        <div className={cn("relative inline-flex h-11 items-center gap-2 rounded-t-[22px] px-5 text-[14px] font-semibold", c.text)} style={{ background: c.bg }}>
          {tab}
          {/* concave joint between tab and body */}
          <span
            aria-hidden
            className="absolute -right-[22px] bottom-0 size-[22px]"
            style={{ background: `radial-gradient(circle at 100% 0, transparent 21.5px, ${c.bg} 22px)` }}
          />
        </div>
        {tabRight && <div className="mb-2 flex items-center gap-2">{tabRight}</div>}
      </div>
      <div className={cn("rounded-[0_34px_34px_34px] p-5 sm:p-6", c.text, bodyClassName)} style={{ background: c.bg }}>
        {children}
      </div>
    </As>
  );
}

/* ------------------------------------------------------------------ */
/* Capsule                                                             */
/* ------------------------------------------------------------------ */

export function Capsule({
  children,
  tone = "glass",
  className,
}: {
  children: React.ReactNode;
  tone?: "glass" | "tint" | "mint" | "amber" | "navy" | "white";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap",
        tone === "glass" && "surface-glass text-white",
        tone === "tint" && "surface-tint text-ink-700",
        tone === "mint" && "bg-mint/15 text-mint-ink",
        tone === "amber" && "bg-amber/15 text-amber-ink",
        tone === "navy" && "bg-midnight text-white",
        tone === "white" && "bg-white text-ink-900 shadow-[0_6px_16px_-8px_rgba(22,80,180,0.4)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tactile button with optional magnetism                              */
/* ------------------------------------------------------------------ */

/** Moves an element up to `max` px toward the cursor. Desktop + motion-OK only. */
export function useMagnetic<T extends HTMLElement>(max = 3) {
  const fine = useFinePointer();
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const onPointerMove = (e: React.PointerEvent<T>) => {
    if (!fine || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    setOffset({ x: Math.max(-1, Math.min(1, dx)) * max, y: Math.max(-1, Math.min(1, dy)) * max });
  };
  const onPointerLeave = () => setOffset({ x: 0, y: 0 });
  return { ref, offset, handlers: { onPointerMove, onPointerLeave } };
}

export const TactileButton = forwardRef<HTMLButtonElement, HTMLMotionProps<"button"> & { magnetic?: boolean }>(function TactileButton(
  { magnetic = false, className, children, ...rest },
  ref,
) {
  const m = useMagnetic<HTMLButtonElement>(3);
  return (
    <motion.button
      ref={(el) => {
        (m.ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      whileTap={{ scale: 0.97 }}
      animate={magnetic ? { x: m.offset.x, y: m.offset.y } : undefined}
      transition={spring.snappy}
      className={className}
      {...(magnetic ? m.handlers : {})}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

/* ------------------------------------------------------------------ */
/* Section title — big, quiet, no boxes                                */
/* ------------------------------------------------------------------ */

export function StoryTitle({ kicker, title, action, className, id }: { kicker?: string; title: React.ReactNode; action?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4 px-1", className)}>
      <div>
        {kicker && <p className="eyebrow mb-1 text-ink-500">{kicker}</p>}
        <h2 id={id} className="font-display text-[26px] leading-tight font-semibold tracking-[-0.025em] text-ink-900 sm:text-[30px]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
