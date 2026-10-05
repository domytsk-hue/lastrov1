/**
 * Lastro motion tokens. Every animation in the app takes its timing from here.
 * Physical, smooth, restrained: no bounce for its own sake.
 */
import type { Transition } from "framer-motion";

export const duration = {
  fast: 0.14,
  normal: 0.28,
  slow: 0.52,
  /** Data that "arrives" (orbit fill, money count). */
  reveal: 0.9,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const spring = {
  soft: { type: "spring", stiffness: 260, damping: 26 } as Transition,
  snappy: { type: "spring", stiffness: 400, damping: 32 } as Transition,
  /** Sheets and large surfaces. */
  sheet: { type: "spring", stiffness: 340, damping: 36, mass: 0.9 } as Transition,
};

export const tween = (d: keyof typeof duration = "normal", delay = 0): Transition => ({
  duration: duration[d],
  ease: ease.out,
  delay,
});

/** Home entrance: each step 80ms apart, total under ~700ms. */
export const STAGGER = 0.08;

export const press = { scale: 0.97, transition: { duration: duration.fast } };
