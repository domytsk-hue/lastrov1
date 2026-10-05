"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/design-system/motion";

/* ---------- Section header ---------- */

export function SectionHeader({ title, href, linkLabel = "Ver tudo", action, className }: { title: string; href?: string; linkLabel?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4 px-1", className)}>
      <h2 className="font-display text-[24px] leading-tight font-semibold tracking-[-0.025em] text-ink-900 sm:text-[28px]">{title}</h2>
      {href ? (
        <Link href={href} className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-white/70 px-4 text-[14px] font-semibold text-ink-900 shadow-[inset_0_1px_0_#fff,0_8px_20px_-14px_rgba(22,80,180,0.5)]">
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

/* ---------- Segmented control: the active pill slides ---------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  label,
  tone = "light",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  size?: "sm" | "md";
  label: string;
  tone?: "light" | "navy";
}) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("relative flex rounded-full p-1", tone === "light" ? "bg-ink-900/[0.06]" : "bg-white/10", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-full font-semibold whitespace-nowrap transition-colors",
              size === "md" ? "h-11 px-4 text-[15px]" : "h-9 px-3 text-[14px]",
              active ? (tone === "light" ? "text-ink-900" : "text-midnight") : tone === "light" ? "text-ink-500 hover:text-ink-900" : "text-white/70 hover:text-white",
            )}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-white shadow-[0_6px_16px_-8px_rgba(22,80,180,0.5)]" transition={spring.snappy} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({ title, body, action, icon, className }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 text-ink-400">{icon}</div>}
      <p className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink-900">{title}</p>
      {body && <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-500">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[28px]", className)} aria-hidden />;
}

/* ---------- Buttons ---------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "mint" | "secondary" | "ghost" | "danger"; size?: "md" | "lg" | "sm" }) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-transform duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        size === "lg" && "h-14 px-7 text-[16px]",
        size === "md" && "h-12 px-6 text-[15px]",
        size === "sm" && "h-10 px-4 text-[14px]",
        variant === "primary" && "bg-midnight text-white shadow-[0_12px_26px_-12px_rgba(7,26,59,0.8)] hover:bg-deep",
        variant === "mint" && "bg-mint text-midnight shadow-[0_12px_26px_-12px_rgba(24,224,174,0.9)]",
        variant === "secondary" && "bg-white text-ink-900 shadow-[0_8px_20px_-12px_rgba(22,80,180,0.5)] hover:bg-snow",
        variant === "ghost" && "text-ink-700 hover:bg-ink-900/5",
        variant === "danger" && "bg-rose/10 text-rose-ink hover:bg-rose/15",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Page header: big, editorial ---------- */

export function PageHeader({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 px-1 pt-1 lg:mb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="mb-1.5 text-[15px] font-medium text-ink-500">{eyebrow}</p>}
          <h1 className="font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink-900 lg:text-[48px]">{title}</h1>
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
      <span className="mb-2 block text-[14px] font-semibold text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-ink-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-13 w-full rounded-[20px] bg-white px-4 text-[16px] text-ink-900 placeholder:text-ink-400 outline-none shadow-[inset_0_0_0_1.5px_rgba(23,61,145,0.08),0_6px_16px_-12px_rgba(22,80,180,0.4)] transition-shadow focus:shadow-[inset_0_0_0_2px_#3678F5,0_6px_16px_-12px_rgba(22,80,180,0.4)]";
