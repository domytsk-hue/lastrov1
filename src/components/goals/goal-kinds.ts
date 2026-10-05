import { Car, Gem, HandCoins, House, Laptop, Plane, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react";
import type { GoalKind } from "@/lib/types";

export const GOAL_KINDS: { kind: GoalKind; label: string; icon: LucideIcon; color: string; name: string }[] = [
  { kind: "trip", label: "Viagem", icon: Plane, color: "#FF455D", name: "Viagem" },
  { kind: "car", label: "Carro", icon: Car, color: "#5B8CFF", name: "Carro" },
  { kind: "house", label: "Casa", icon: House, color: "#8B6BFF", name: "Casa própria" },
  { kind: "computer", label: "Computador", icon: Laptop, color: "#4FE3C1", name: "Computador novo" },
  { kind: "emergency", label: "Reserva", icon: ShieldCheck, color: "#00D99B", name: "Reserva extra" },
  { kind: "debt", label: "Quitar dívida", icon: HandCoins, color: "#FF8A5B", name: "Quitar dívida" },
  { kind: "investment", label: "Investimento", icon: TrendingUp, color: "#2563F5", name: "Primeiros R$ 100 mil" },
  { kind: "custom", label: "Outro", icon: Gem, color: "#FFC234", name: "" },
];

export const goalKind = (k: GoalKind) => GOAL_KINDS.find((g) => g.kind === k) ?? GOAL_KINDS[GOAL_KINDS.length - 1];
