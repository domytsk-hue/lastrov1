"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "neutral" | "attention";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: Tone;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

const ICON: Record<Tone, React.ReactNode> = {
  success: <Check className="size-4" strokeWidth={2.5} />,
  neutral: <Info className="size-4" />,
  attention: <TriangleAlert className="size-4" />,
};

const ICON_BG: Record<Tone, string> = {
  success: "bg-mint text-midnight",
  neutral: "bg-white/15 text-white",
  attention: "bg-amber text-midnight",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++counter.current;
      setItems((xs) => [...xs.slice(-1), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.duration ?? 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] lg:top-auto lg:bottom-8"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const tone = t.tone ?? "success";
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[28px] bg-midnight/95 p-3 pr-3 text-white shadow-[0_24px_50px_-18px_rgba(7,26,59,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"
                role="status"
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", ICON_BG[tone])}>{ICON[tone]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-semibold">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-[14px] leading-snug text-white/70">{t.body}</p>}
                </div>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-[14px] font-semibold text-mint transition-transform hover:bg-white/15 active:scale-95"
                  >
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
