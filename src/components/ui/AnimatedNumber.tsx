"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Counts from the previous value to the new one. On first render it counts up from
 * `from` (default 0) so financial numbers "arrive" instead of popping in.
 */
export function useAnimatedNumber(value: number, { duration = 0.9, from = 0 }: { duration?: number; from?: number } = {}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : from);
  const prev = useRef(reduce ? value : from);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return display;
}

export function AnimatedNumber({
  value,
  format,
  duration,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const v = useAnimatedNumber(value, { duration });
  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(v)}</span>
    </span>
  );
}
