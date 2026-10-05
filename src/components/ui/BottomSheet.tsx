"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { spring, tween } from "@/lib/motion";

/**
 * <ExpandableSheet /> — a floating light sheet. On mobile it rises from the bottom (drag the
 * handle to dismiss); on desktop it floats centered. Locks scroll, traps focus, Escape closes.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideTitle,
  size = "md",
  tone = "light",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  hideTitle?: boolean;
  size?: "md" | "lg";
  tone?: "light" | "ice";
}) {
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
          <motion.div
            className="absolute inset-0 bg-[#0b2350]/30 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween("normal")}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            className={cn(
              "relative m-2 flex max-h-[94dvh] w-[calc(100%-16px)] flex-col overflow-hidden rounded-[40px] text-ink-900 shadow-[0_-10px_80px_-20px_rgba(7,26,59,0.55)] outline-none lg:m-0",
              tone === "light" ? "bg-gradient-to-b from-white to-[#EEF7FF]" : "bg-gradient-to-b from-[#EAF6FF] to-[#CDE9FF]",
              size === "md" ? "lg:max-w-[480px]" : "lg:max-w-[580px]",
              className,
            )}
            initial={reduce ? { opacity: 0 } : { y: "105%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "105%" }}
            transition={spring.sheet}
            drag={reduce ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing lg:hidden" onPointerDown={(e) => drag.start(e)} aria-hidden>
              <div className="h-1.5 w-11 rounded-full bg-ink-900/15" />
            </div>
            <div className={cn("flex shrink-0 items-start justify-between gap-4 px-6 pt-2 lg:pt-6", hideTitle && "sr-only")}>
              <div>
                <h2 id={`${id}-title`} className="font-display text-[26px] leading-tight font-semibold tracking-[-0.025em]">
                  {title}
                </h2>
                {description && <p className="mt-1 text-[15px] text-ink-500">{description}</p>}
              </div>
              <button onClick={onClose} className="-mr-1 grid size-10 shrink-0 place-items-center rounded-full bg-ink-900/5 text-ink-700 transition-transform hover:bg-ink-900/10 active:scale-95" aria-label="Fechar">
                <X className="size-[18px]" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-[max(24px,var(--safe-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
