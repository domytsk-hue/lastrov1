/**
 * Demo data for the public site. Plain constants that mirror the product's demo account
 * (Lucas), so every number a visitor sees here is one they will meet again inside /app.
 * Marketing never imports the product's stores or domain — only these values.
 */
import type { LastroDimension } from "@/components/shared/data-viz/LastroOrbitView";

export const DEMO = {
  name: "Lucas",
  available: 5960,
  income: 8562,
  spent: 2187,
  saved: 415,
  paceVsLastMonth: 356,
  /** Variable budgets left this month and days remaining (product: R$ 2.063 over 27 days). */
  freeThisMonth: 2063,
  daysLeft: 27,
  todaySpent: 34.38,
  reserve: { months: 3.2, days: 96, targetMonths: 6, balance: 12400 },
  goal: { name: "Japão", saved: 8420, target: 15000, eta: "maio de 2027", color: "#FF455D" },
  netWorth: { now: 52780, monthDelta: 2480 },
  investments: { total: 28450, monthly: 1000, gain: 3050 },
  score: 74,
  previousScore: 68,
};

/** The six dimensions of the Lastro, phrased exactly as the product phrases them. */
export const DEMO_DIMENSIONS: LastroDimension[] = [
  {
    id: "reserva",
    label: "Reserva",
    value: 0.53,
    color: "#0FB98F",
    colorTo: "#18E0AE",
    story: { big: "3,2", unit: "meses protegidos", sentence: "96 dias de tranquilidade. A meta é 6 meses.", delta: { text: "+0,4 este mês", positive: true } },
  },
  {
    id: "fluxo",
    label: "Fluxo",
    value: 1,
    color: "#0B2560",
    colorTo: "#2C63D8",
    story: { big: "1.690", unit: "reais previstos livres", sentence: "Neste ritmo, já contando metas e aportes." },
  },
  {
    id: "orcamento",
    label: "Orçamento",
    value: 0.93,
    color: "#173D91",
    colorTo: "#3678F5",
    story: { big: "2,1 mil", unit: "livres no mês", sentence: "Tudo no ritmo. Você pode gastar cerca de R$ 76 por dia." },
  },
  {
    id: "metas",
    label: "Metas",
    value: 0.6,
    color: "#3678F5",
    colorTo: "#8CCBFF",
    story: { big: "56%", unit: "do caminho até o Japão", sentence: "No seu ritmo, chega em maio de 2027.", delta: { text: "+R$ 600 este mês", positive: true } },
  },
  {
    id: "investimentos",
    label: "Investimentos",
    value: 0.52,
    color: "#2459D6",
    colorTo: "#65B7F2",
    story: { big: "28,5 mil", unit: "investidos", sentence: "Aporte de R$ 1.000 este mês. Constância é o que importa.", delta: { text: "+R$ 1.000 este mês", positive: true } },
  },
  {
    id: "dividas",
    label: "Dívidas",
    value: 0.86,
    color: "#4F6A8E",
    colorTo: "#9DB4D3",
    story: { big: "2,5 mil", unit: "na fatura", sentence: "Fatura do mês, sem rotativo. Sob controle." },
  },
];

/** Net worth, month by month (the product's demo history). */
export const DEMO_NET_WORTH = [
  { month: "2025-10", value: 37200 },
  { month: "2025-11", value: 38150 },
  { month: "2025-12", value: 38900 },
  { month: "2026-01", value: 40420 },
  { month: "2026-02", value: 41100 },
  { month: "2026-03", value: 42650 },
  { month: "2026-04", value: 43900 },
  { month: "2026-05", value: 44800 },
  { month: "2026-06", value: 46550 },
  { month: "2026-07", value: 47900 },
  { month: "2026-08", value: 48720 },
  { month: "2026-09", value: 50300 },
  { month: "2026-10", value: 52780 },
];

export const DEMO_MILESTONES = [
  { id: "m1", date: "2025-11-09", title: "Primeiros R$ 10 mil investidos" },
  { id: "m2", date: "2026-04-17", title: "Meta Japão passou de 25%" },
  { id: "m3", date: "2026-07-28", title: "R$ 25 mil investidos" },
  { id: "m4", date: "2026-09-06", title: "Reserva cobre 3 meses" },
];

export const DEMO_ALLOCATION = [
  { id: "renda-fixa", label: "Renda fixa", value: 16150, color: "#173D91", colorTo: "#3678F5" },
  { id: "etfs", label: "ETFs", value: 4630, color: "#2459D6", colorTo: "#65B7F2" },
  { id: "acoes", label: "Ações", value: 840, color: "#0B2560", colorTo: "#2C63D8" },
  { id: "fiis", label: "FIIs", value: 3820, color: "#0FB98F", colorTo: "#18E0AE" },
  { id: "internacional", label: "Internacional", value: 3010, color: "#3678F5", colorTo: "#8CCBFF" },
];

/** Budget used by the daily demo (Alimentação, as in the product demo). */
export const DEMO_BUDGET = { category: "Alimentação", limit: 900, spent: 620 };
