/**
 * The plan catalog of Lastro — the ONE source of truth for ids, names, prices and benefits.
 * The landing, the checkout, the profile card and the server all read it from here.
 *
 * Money is integer minor units (centavos). The ids are the ones Centralis already knows
 * (`plan` on user and purchase events) — never rename them.
 *
 * The database keeps a `lastro.plans` row per plan only so orders can reference it; a test
 * checks that the seeded rows match this file.
 */

export type PlanId = "mensal" | "vitalicio";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  amountMinor: number;
  currency: "BRL";
  billing: "monthly" | "one_time";
  /** How the price is said everywhere: "R$ 19,90 por mês" / "R$ 79,90 em pagamento único". */
  priceLabel: string;
  /** Short nature of the charge, for summaries. */
  billingLabel: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  mensal: {
    id: "mensal",
    name: "Mensal",
    amountMinor: 1990,
    currency: "BRL",
    billing: "monthly",
    priceLabel: "R$ 19,90 por mês",
    billingLabel: "Cobrança mensal",
  },
  vitalicio: {
    id: "vitalicio",
    name: "Vitalício",
    amountMinor: 7990,
    currency: "BRL",
    billing: "one_time",
    priceLabel: "R$ 79,90 em pagamento único",
    billingLabel: "Pagamento único · acesso para sempre",
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as string[]).includes(v);

/** Both plans include everything; this is the list the landing shows. */
export const PLAN_BENEFITS = ["Orçamentos, metas e reserva", "Patrimônio e investimentos", "Aulas no momento certo"] as const;

/** Minor units → major units for display math (1990 → 19.9). */
export const toMajorUnits = (minor: number) => minor / 100;
