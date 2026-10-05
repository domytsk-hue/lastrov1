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
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import type { CategoryId, Transaction } from "@/lib/types";

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
export function CategoryIcon({ id, size = 40, className }: { id?: CategoryId; size?: number; className?: string }) {
  const cat = getCategory(id);
  const Icon = categoryIcon(id);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-[14px]", className)}
      style={{ width: size, height: size, background: `${cat.color}1f`, color: cat.color }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
    </span>
  );
}

/** Icon for any transaction, including transfers and investments. */
export function TransactionIcon({ tx, reserveAccountId, size = 40 }: { tx: Transaction; reserveAccountId: string; size?: number }) {
  if (tx.type === "expense" || tx.type === "income") {
    if (tx.type === "income" && !tx.categoryId) {
      return <Tile size={size} color="#00D99B" Icon={ArrowDownLeft} />;
    }
    return <CategoryIcon id={tx.categoryId} size={size} />;
  }
  if (tx.type === "investment") return <Tile size={size} color="#5B8CFF" Icon={TrendingUp} />;
  if (tx.goalId) return <Tile size={size} color="#FFC234" Icon={Target} />;
  if (tx.toAccountId === reserveAccountId) return <Tile size={size} color="#00D99B" Icon={ShieldCheck} />;
  return <Tile size={size} color="#AEB4BD" Icon={ArrowLeftRight} />;
}

function Tile({ size, color, Icon }: { size: number; color: string; Icon: LucideIcon }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px]" style={{ width: size, height: size, background: `${color}1f`, color }} aria-hidden>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2} />
    </span>
  );
}
