"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { ease } from "@/design-system/motion";
import { useUI, type Flow } from "@/product/store/ui-store";

export const FLOW_ARRIVE = "lastro:flow-arrive";

/**
 * Money moving through the interface: after a movement is saved, its amount lifts off
 * the action and travels to the number it changes (usually the balance). On arrival the
 * target gets a `lastro:flow-arrive` event so it can glow while its digits roll.
 */
export function FlowLayer() {
  const { flows, endFlow } = useUI();
  return (
    <div className="pointer-events-none fixed inset-0 z-[75]" aria-hidden>
      <AnimatePresence>
        {flows.map((f) => (
          <Particle key={f.id} flow={f} onDone={() => endFlow(f.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Particle({ flow, onDone }: { flow: Flow; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = document.querySelector(flow.to);
    if (el) {
      const r = el.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight;
      setTo(visible ? { x: r.left + Math.min(r.width, 220) / 2, y: r.top + r.height / 2 } : { x: flow.from.x, y: flow.from.y - 160 });
    } else setTo({ x: flow.from.x, y: flow.from.y - 160 });
  }, [flow]);

  if (!to) return null;
  const dx = to.x - flow.from.x;
  const dy = to.y - flow.from.y;

  return (
    <motion.div
      className="absolute"
      style={{ left: flow.from.x, top: flow.from.y }}
      initial={{ x: "-50%", y: "-50%", opacity: 0, scale: 0.8 }}
      animate={
        reduce
          ? { opacity: [0, 1, 0] }
          : {
              x: ["-50%", "-50%", `calc(-50% + ${dx}px)`],
              y: ["-50%", "calc(-50% - 28px)", `calc(-50% + ${dy}px)`],
              opacity: [0, 1, 0],
              scale: [0.8, 1.05, 0.6],
            }
      }
      transition={{ duration: reduce ? 0.6 : 0.75, times: [0, 0.3, 1], ease: ease.inOut }}
      onAnimationComplete={() => {
        window.dispatchEvent(new CustomEvent(FLOW_ARRIVE, { detail: { to: flow.to, tone: flow.tone } }));
        onDone();
      }}
    >
      <span
        className={cn(
          "inline-flex h-10 items-center rounded-full px-4 font-display text-[17px] font-semibold whitespace-nowrap shadow-[0_14px_30px_-10px_rgba(7,26,59,0.55)]",
          flow.tone === "spend" && "bg-midnight text-white",
          flow.tone === "gain" && "bg-mint text-midnight",
          flow.tone === "save" && "bg-white text-ink-900",
        )}
      >
        {flow.text}
      </span>
    </motion.div>
  );
}

/** Subscribe a surface to flow arrivals (for a brief glow). */
export function useFlowArrival(selector: string, onArrive: (tone: Flow["tone"]) => void) {
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ to: string; tone: Flow["tone"] }>).detail;
      if (d.to === selector) onArrive(d.tone);
    };
    window.addEventListener(FLOW_ARRIVE, h);
    return () => window.removeEventListener(FLOW_ARRIVE, h);
  }, [selector, onArrive]);
}
