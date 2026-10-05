"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "," | "00" | "+" | "-" | "×" | "÷" | "%" | "back" | "clear" | "=";

const ROWS: KeypadKey[][] = [
  ["7", "8", "9", "÷", "back"],
  ["4", "5", "6", "×", "%"],
  ["1", "2", "3", "-", "clear"],
  [",", "0", "00", "+", "="],
];

const LABEL: Partial<Record<KeypadKey, string>> = { "-": "−", clear: "C", "=": "=" };
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

/** Calculator keypad. Digits feel like a phone dialer; operators are quieter. */
export function Keypad({ onKey, className }: { onKey: (k: KeypadKey) => void; className?: string }) {
  return (
    <div className={cn("grid grid-cols-5 gap-1.5", className)} role="group" aria-label="Calculadora">
      {ROWS.flat().map((k) => {
        const isDigit = /^[\d,]+$/.test(k);
        const isOp = ["+", "-", "×", "÷", "%"].includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => {
              onKey(k);
              if ("vibrate" in navigator) navigator.vibrate?.(4);
            }}
            aria-label={ARIA[k] ?? k}
            className={cn(
              "pressable grid h-[50px] place-items-center rounded-[14px] select-none",
              isDigit && "bg-white/[0.05] font-display text-[22px] font-medium text-off hover:bg-white/[0.08]",
              isOp && "bg-white/[0.025] text-[20px] font-medium text-blue-light hover:bg-white/[0.06]",
              k === "back" && "bg-white/[0.025] text-soft hover:bg-white/[0.06]",
              k === "clear" && "bg-white/[0.025] text-[15px] font-semibold text-soft hover:bg-white/[0.06]",
              k === "=" && "bg-blue/25 text-[20px] font-semibold text-blue-light hover:bg-blue/35",
            )}
          >
            {k === "back" ? <Delete className="size-5" /> : (LABEL[k] ?? k)}
          </button>
        );
      })}
    </div>
  );
}
