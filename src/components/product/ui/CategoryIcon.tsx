import {
  ArrowDownLeft,
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleDashed,
  GraduationCap,
  HeartPulse,
  Home,
  PlusCircle,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Ticket,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { getCategory } from "@/product/data/categories";
import { cn } from "@/lib/cn";
import type { CategoryId, Transaction } from "@/product/domain/types";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  home: Home,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  ticket: Ticket,
  repeat: Repeat,
  "graduation-cap": GraduationCap,
  "circle-dashed": CircleDashed,
  briefcase: Briefcase,
  sparkles: Sparkles,
  "trending-up": TrendingUp,
  "plus-circle": PlusCircle,
};

export function categoryIcon(id?: CategoryId): LucideIcon {
  return ICONS[getCategory(id).icon] ?? CircleDashed;
}

/** Rounded tile with the category's icon, tinted with its colour. */
export function CategoryIcon({ id, size = 40, className, round }: { id?: CategoryId; size?: number; className?: string; round?: boolean }) {
  const cat = getCategory(id);
  const Icon = categoryIcon(id);
  return (
    <span
      className={cn("grid shrink-0 place-items-center", round ? "rounded-full" : "rounded-[14px]", className)}
      style={{ width: size, height: size, background: `${cat.color}24`, color: cat.color }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
    </span>
  );
}

/** Icon for any transaction, including transfers and investments. */
export function TransactionIcon({ tx, reserveAccountId, size = 40, round }: { tx: Transaction; reserveAccountId: string; size?: number; round?: boolean }) {
  if (tx.type === "expense" || tx.type === "income") {
    if (tx.type === "income" && !tx.categoryId) {
      return <Tile size={size} color="#0FB98F" Icon={ArrowDownLeft} round={round} />;
    }
    return <CategoryIcon id={tx.categoryId} size={size} round={round} />;
  }
  if (tx.type === "investment") return <Tile size={size} color="#3678F5" Icon={TrendingUp} round={round} />;
  if (tx.goalId) return <Tile size={size} color="#E89A0C" Icon={Target} round={round} />;
  if (tx.toAccountId === reserveAccountId) return <Tile size={size} color="#0FB98F" Icon={ShieldCheck} round={round} />;
  return <Tile size={size} color="#7890AF" Icon={ArrowLeftRight} round={round} />;
}

function Tile({ size, color, Icon, round }: { size: number; color: string; Icon: LucideIcon; round?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center", round ? "rounded-full" : "rounded-[14px]")} style={{ width: size, height: size, background: `${color}24`, color }} aria-hidden>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
    </span>
  );
}
