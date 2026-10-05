"use client";

import { motion } from "framer-motion";
import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "," | "00" | "+" | "-" | "×" | "÷" | "%" | "back" | "clear" | "=";

const ROWS: KeypadKey[][] = [
  ["7", "8", "9", "÷", "back"],
  ["4", "5", "6", "×", "%"],
  ["1", "2", "3", "-", "clear"],
  [",", "0", "00", "+", "="],
];

const LABEL: Partial<Record<KeypadKey, string>> = { "-": "−", clear: "C" };
const ARIA: Partial<Record<KeypadKey, string>> = {
  back: "Apagar",
  clear: "Limpar",
  "÷": "Dividir",
  "×": "Multiplicar",
  "-": "Subtrair",
  "+": "Somar",
  "%": "Porcentagem",
  "=": "Calcular resultado",
};

/** Floating white number keys; navy operators; the result key in electric blue. */
export function Keypad({ onKey, className }: { onKey: (k: KeypadKey) => void; className?: string }) {
  return (
    <div className={cn("grid grid-cols-5 gap-2", className)} role="group" aria-label="Calculadora">
      {ROWS.flat().map((k) => {
        const isDigit = /^[\d,]+$/.test(k);
        const isOp = ["+", "-", "×", "÷", "%"].includes(k);
        return (
          <motion.button
            key={k}
            type="button"
            whileTap={{ scale: 0.92 }}
            transition={spring.snappy}
            onClick={() => {
              onKey(k);
              if ("vibrate" in navigator) navigator.vibrate?.(4);
            }}
            aria-label={ARIA[k] ?? k}
            className={cn(
              "grid h-[54px] place-items-center rounded-[22px] select-none",
              isDigit && "bg-white font-display text-[24px] font-medium text-ink-900 shadow-[0_8px_18px_-12px_rgba(22,80,180,0.55),inset_0_1px_0_#fff]",
              isOp && "bg-midnight text-[22px] font-medium text-white shadow-[0_8px_18px_-12px_rgba(7,26,59,0.8)]",
              (k === "back" || k === "clear") && "bg-white/55 text-[16px] font-semibold text-ink-700",
              k === "=" && "bg-electric text-[22px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(54,120,245,0.9)]",
            )}
          >
            {k === "back" ? <Delete className="size-5" /> : (LABEL[k] ?? k)}
          </motion.button>
        );
      })}
    </div>
  );
}
