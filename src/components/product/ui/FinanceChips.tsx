"use client";

/** Finance-specific chips and badges: they speak the product's domain (categories, budget states). */
import { motion } from "framer-motion";
import { CircleAlert, CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/design-system/motion";
import { getCategory } from "@/product/data/categories";
import type { BudgetState, CategoryId } from "@/product/domain/types";
import { categoryIcon } from "./CategoryIcon";

/* ---------- Category chip: the selected state morphs between chips ---------- */

export function CategoryChip({ id, selected, onClick, compact, layoutGroup }: { id: CategoryId; selected?: boolean; onClick?: () => void; compact?: boolean; layoutGroup?: string }) {
  const cat = getCategory(id);
  const Icon = categoryIcon(id);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileTap={{ scale: 0.95 }}
      className={cn("relative flex shrink-0 items-center gap-2 rounded-full font-semibold", compact ? "h-11 pr-4 pl-1.5 text-[14px]" : "h-12 pr-4 pl-2 text-[15px]", selected ? "text-white" : "bg-white text-ink-700 shadow-[0_6px_16px_-10px_rgba(22,80,180,0.45)]")}
    >
      {selected && <motion.span layoutId={layoutGroup ?? "chip-selected"} className="absolute inset-0 rounded-full bg-midnight" transition={spring.snappy} />}
      <span className="relative grid size-8 place-items-center rounded-full" style={{ background: selected ? cat.color : `${cat.color}24`, color: selected ? "#fff" : cat.color }}>
        <Icon className="size-4" strokeWidth={2.2} />
      </span>
      <span className="relative">{cat.name}</span>
    </motion.button>
  );
}

/* ---------- Budget state (never colour-only) ---------- */

export const STATE_COLOR: Record<BudgetState, string> = {
  healthy: "#0FB98F",
  attention: "#E89A0C",
  critical: "#F08A4B",
  exceeded: "#F0566B",
};

const STATE_ICON = { healthy: CircleCheck, attention: CircleAlert, critical: TriangleAlert, exceeded: CircleX };
const STATE_LABEL: Record<BudgetState, string> = { healthy: "No ritmo", attention: "Atenção", critical: "Crítico", exceeded: "Passou" };

export function StateBadge({ state, className }: { state: BudgetState; className?: string }) {
  const Icon = STATE_ICON[state];
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold", className)} style={{ color: STATE_COLOR[state], background: `${STATE_COLOR[state]}1f` }}>
      <Icon className="size-4" strokeWidth={2.4} />
      {STATE_LABEL[state]}
    </span>
  );
}
