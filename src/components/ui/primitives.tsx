"use client";

import { motion } from "framer-motion";
import { ArrowRight, CircleAlert, CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import type { BudgetState, CategoryId } from "@/lib/types";
import { categoryIcon } from "./CategoryIcon";

/* ---------- Section header ---------- */

export function SectionHeader({
  title,
  href,
  linkLabel = "Ver tudo",
  action,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between px-1", className)}>
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-off">{title}</h2>
      {href ? (
        <Link href={href} className="group flex items-center gap-1 rounded-lg px-1 py-1 text-[13px] font-medium text-soft hover:text-off">
          {linkLabel}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  size?: "sm" | "md";
  label: string;
}) {
  const layoutId = `seg-${label}`;
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative flex rounded-full bg-white/[0.05] p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-full font-medium whitespace-nowrap transition-colors",
              size === "md" ? "h-9 px-3.5 text-[14px]" : "h-8 px-3 text-[13px]",
              active ? "text-ink" : "text-soft hover:text-off",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-off"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Category chip ---------- */

export function CategoryChip({
  id,
  selected,
  onClick,
  compact,
}: {
  id: CategoryId;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const cat = getCategory(id);
  const Icon = categoryIcon(id);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "pressable flex shrink-0 items-center gap-2 rounded-full border text-[14px] font-medium transition-colors",
        compact ? "h-9 px-3" : "h-10 pl-2 pr-3.5",
        selected ? "border-transparent text-ink" : "border-white/[0.08] bg-white/[0.03] text-soft hover:text-off",
      )}
      style={selected ? { background: cat.color } : undefined}
    >
      <span
        className="grid size-6 place-items-center rounded-full"
        style={{ background: selected ? "rgba(0,0,0,0.14)" : `${cat.color}22`, color: selected ? "#050607" : cat.color }}
      >
        <Icon className="size-3.5" strokeWidth={2.2} />
      </span>
      {cat.name}
    </button>
  );
}

/* ---------- Budget state badge (never colour-only) ---------- */

export const STATE_COLOR: Record<BudgetState, string> = {
  healthy: "#00D99B",
  attention: "#FFC234",
  critical: "#FF8A5B",
  exceeded: "#FF455D",
};

const STATE_ICON = { healthy: CircleCheck, attention: CircleAlert, critical: TriangleAlert, exceeded: CircleX };
const STATE_LABEL: Record<BudgetState, string> = { healthy: "Saudável", attention: "Atenção", critical: "Crítico", exceeded: "Excedido" };

export function StateBadge({ state, className }: { state: BudgetState; className?: string }) {
  const Icon = STATE_ICON[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold", className)}
      style={{ color: STATE_COLOR[state], background: `${STATE_COLOR[state]}1a` }}
    >
      <Icon className="size-3.5" strokeWidth={2.4} />
      {STATE_LABEL[state]}
    </span>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-4 text-muted">{icon}</div>}
      <p className="font-display text-[19px] font-semibold tracking-[-0.01em]">{title}</p>
      {body && <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-2xl", className)} aria-hidden />;
}

/* ---------- Buttons ---------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "md" | "lg" | "sm" }) {
  return (
    <button
      {...rest}
      className={cn(
        "pressable inline-flex items-center justify-center gap-2 rounded-[16px] font-semibold disabled:pointer-events-none disabled:opacity-40",
        size === "lg" && "h-14 px-6 text-[16px]",
        size === "md" && "h-12 px-5 text-[15px]",
        size === "sm" && "h-9 rounded-[12px] px-3.5 text-[13px]",
        variant === "primary" && "bg-green text-ink hover:bg-green-light",
        variant === "secondary" && "bg-white/[0.07] text-off hover:bg-white/[0.11]",
        variant === "ghost" && "text-soft hover:bg-white/[0.05] hover:text-off",
        variant === "danger" && "bg-coral/12 text-coral-light hover:bg-coral/20",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Page header ---------- */

export function PageHeader({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 pt-2 lg:mb-8 lg:pt-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.03em] lg:text-[36px]">{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </header>
  );
}

/* ---------- Field ---------- */

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-12 w-full rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-4 text-[15px] text-off placeholder:text-muted outline-none transition-colors focus:border-green/60 focus:bg-white/[0.06]";
