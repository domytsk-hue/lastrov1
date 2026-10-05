/**
 * Realistic Brazilian demo data for "Lucas", generated relative to `today` so the demo
 * always looks alive. Deterministic: the same `today` yields the same data.
 *
 * Calibrated so that at seed time:
 *   income R$ 8.500/mês · typical spending ≈ R$ 4.860/mês
 *   investments R$ 28.450 · reserve R$ 12.400 · net worth R$ 52.780
 */
import {
  addMonths,
  daysInMonth,
  parseISODate,
  round2,
  startOfMonth,
} from "../lib/format.ts";
import type {
  Account,
  CategoryId,
  FinanceState,
  ISODate,
  Milestone,
  NetWorthPoint,
  Transaction,
} from "../lib/types.ts";

export const STATE_VERSION = 4;

export const ACC = {
  checking: "acc-nubank",
  cash: "acc-carteira",
  card: "acc-cartao",
  reserve: "acc-reserva",
  goals: "acc-caixinhas",
  invest: "acc-corretora",
} as const;

export const GOAL_JAPAN = "goal-japao";

/** Mulberry32 — tiny deterministic PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDemoState(today: ISODate): FinanceState {
  const rand = prng(Number(today.replace(/-/g, "")));
  const between = (min: number, max: number) => round2(min + rand() * (max - min));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  const txs: Transaction[] = [];
  let n = 0;
  const add = (
    date: ISODate,
    type: Transaction["type"],
    amount: number,
    description: string,
    extra: Partial<Transaction> = {},
  ) => {
    if (date > today) return;
    txs.push({
      id: `seed-${++n}`,
      type,
      amount: round2(amount),
      description,
      accountId: ACC.checking,
      date,
      recurring: "none",
      tags: [],
      createdAt: `${date}T12:00:00`,
      ...extra,
    });
  };
  const expense = (date: ISODate, amount: number, description: string, categoryId: CategoryId, extra: Partial<Transaction> = {}) =>
    add(date, "expense", amount, description, { categoryId, ...extra });

  const currentMonth = startOfMonth(today);
  const cardSpendByMonth = new Map<string, number>();

  for (let offset = -3; offset <= 0; offset++) {
    const m = addMonths(currentMonth, offset);
    const dim = daysInMonth(m);
    const day = (d: number) => `${m.slice(0, 7)}-${String(Math.min(d, dim)).padStart(2, "0")}`;
    const card = { accountId: ACC.card };
    let cardSpend = 0;
    const onCard = (date: ISODate, amount: number, description: string, categoryId: CategoryId, extra: Partial<Transaction> = {}) => {
      if (date <= today) cardSpend += round2(amount);
      expense(date, amount, description, categoryId, { ...card, ...extra });
    };

    // Income
    add(day(5), "income", 8500, "Salário", { categoryId: "salario", recurring: "monthly" });
    if (offset === -2) add(day(19), "income", 1200, "Projeto freelance — landing page", { categoryId: "freelance" });
    add(day(1), "income", between(38, 64), "Rendimento da reserva", { categoryId: "rendimentos", accountId: ACC.reserve });

    // Fixed costs
    expense(day(5), 1650, "Aluguel", "moradia", { recurring: "monthly" });
    expense(day(10), 280, "Condomínio", "moradia", { recurring: "monthly" });
    expense(day(12), between(118, 162), "Conta de luz", "moradia", { recurring: "monthly" });
    expense(day(15), 109.9, "Internet fibra", "moradia", { recurring: "monthly" });
    onCard(day(8), 55.9, "Netflix", "assinaturas", { recurring: "monthly" });
    onCard(day(9), 21.9, "Spotify", "assinaturas", { recurring: "monthly" });
    onCard(day(14), 10.9, "iCloud", "assinaturas", { recurring: "monthly" });
    onCard(day(20), 99.9, "ChatGPT Plus", "assinaturas", { recurring: "monthly" });
    expense(day(7), 240, "Curso de inglês", "educacao", { recurring: "monthly" });
    expense(day(3), 119.9, "Academia", "saude", { recurring: "monthly" });

    // Monthly moves toward the future
    add(day(6), "investment", 1000, "Aporte mensal — Tesouro IPCA+", {
      toAccountId: ACC.invest,
      investmentClass: "renda-fixa",
      recurring: "monthly",
    });
    add(day(6), "transfer", 400, "Reserva de emergência", { toAccountId: ACC.reserve, recurring: "monthly" });
    add(day(6), "transfer", 600, "Viagem Japão", { toAccountId: ACC.goals, goalId: GOAL_JAPAN, recurring: "monthly" });

    // Variable spending, day by day
    for (let d = 1; d <= dim; d++) {
      const date = day(d);
      if (date > today) break;
      const wd = parseISODate(date).getDay();
      const weekday = wd >= 1 && wd <= 5;

      if (weekday && rand() < 0.4) {
        expense(date, between(26, 39), pick(["Almoço", "Almoço executivo", "Almoço — self-service"]), "alimentacao");
      }
      if (rand() < 0.1) {
        onCard(date, between(42, 78), pick(["iFood", "Delivery — pizza", "iFood — japonês", "Delivery — hambúrguer"]), "alimentacao", { tags: ["delivery"] });
      }
      if (wd === 6 || (wd === 3 && rand() < 0.2)) {
        expense(date, wd === 6 ? between(115, 165) : between(38, 70), wd === 6 ? "Mercado — compra da semana" : "Mercado", "alimentacao");
      }
      if (rand() < 0.1) expense(date, between(9, 22), pick(["Padaria", "Café", "Café da manhã"]), "alimentacao", { accountId: rand() < 0.5 ? ACC.cash : ACC.checking });

      if (weekday && rand() < 0.22) expense(date, between(14, 29), pick(["Uber", "99"]), "transporte");
      if (d === 4 || d === 19) expense(date, between(170, 215), "Gasolina", "transporte");
      if (wd === 5 && rand() < 0.3) expense(date, between(18, 30), "Estacionamento", "transporte");

      if ((wd === 5 || wd === 6) && rand() < 0.28) {
        onCard(date, between(60, 150), pick(["Cinema", "Bar com amigos", "Show", "Passeio", "Ingresso — teatro"]), "lazer");
      }
      if (rand() < 0.05) onCard(date, between(79, 220), pick(["Camiseta", "Amazon", "Mercado Livre", "Presente"]), "compras");
      if (rand() < 0.03) expense(date, between(32, 96), "Farmácia", "saude");
    }

    cardSpendByMonth.set(m.slice(0, 7), round2(cardSpend));
  }

  // Credit card invoices: each month pays the previous month's card spending on day 10.
  for (let offset = -2; offset <= 0; offset++) {
    const m = addMonths(currentMonth, offset);
    const prev = addMonths(m, -1).slice(0, 7);
    const amount = cardSpendByMonth.get(prev);
    if (amount) add(`${m.slice(0, 7)}-10`, "transfer", amount, "Pagamento da fatura", { toAccountId: ACC.card });
  }

  // Back-compute opening balances so that *today* matches the calibrated snapshot.
  const targets: Record<string, number> = {
    [ACC.checking]: 5840,
    [ACC.cash]: 120,
    [ACC.card]: -2450,
    [ACC.reserve]: 12400,
    [ACC.goals]: 8420,
  };
  const delta = (id: string) =>
    txs.reduce((sum, t) => {
      if (t.accountId === id) sum += t.type === "income" ? t.amount : -t.amount;
      if (t.toAccountId === id && t.type === "transfer") sum += t.amount;
      return sum;
    }, 0);

  const accounts: Account[] = [
    { id: ACC.checking, name: "Conta principal", institution: "Nubank", type: "checking", openingBalance: 0, color: "#8B6BFF" },
    { id: ACC.cash, name: "Carteira", institution: "Dinheiro", type: "cash", openingBalance: 0, color: "#AEB4BD" },
    { id: ACC.card, name: "Cartão de crédito", institution: "Nubank", type: "credit_card", openingBalance: 0, color: "#6637F5" },
    { id: ACC.reserve, name: "Reserva de emergência", institution: "CDB liquidez diária", type: "reserve", openingBalance: 0, color: "#00D99B" },
    { id: ACC.goals, name: "Caixinhas de metas", institution: "Nubank", type: "savings", openingBalance: 0, color: "#FFC234" },
    { id: ACC.invest, name: "Investimentos", institution: "Corretora XP", type: "investment", openingBalance: 0, color: "#2563F5" },
  ];
  for (const a of accounts) {
    if (a.id in targets) a.openingBalance = round2(targets[a.id] - delta(a.id));
  }

  // The Japan goal: R$ 8.420 saved today. Seeded contributions are transfers with goalId.
  const japanContrib = txs.filter((t) => t.goalId === GOAL_JAPAN).reduce((s, t) => s + t.amount, 0);

  // Net worth history: the twelve months before the current one, ending ≈ R$ 50.300.
  const history: NetWorthPoint[] = [];
  const base = [37200, 38150, 38900, 40420, 41100, 42650, 43900, 44800, 46550, 47900, 48720, 50300];
  for (let i = 0; i < 12; i++) {
    const m = addMonths(currentMonth, i - 12).slice(0, 7);
    history.push({ month: m, value: base[i] });
  }

  const ago = (months: number, d = 14) => {
    const m = addMonths(currentMonth, -months);
    return `${m.slice(0, 7)}-${String(Math.min(d, daysInMonth(m))).padStart(2, "0")}`;
  };
  const milestones: Milestone[] = [
    { id: "ms-1", date: ago(11, 9), title: "Primeiros R$ 10 mil investidos", kind: "investment" },
    { id: "ms-2", date: ago(9, 21), title: "Reserva cobre 1 mês", kind: "reserve" },
    { id: "ms-3", date: ago(7, 3), title: "Cartão sem rotativo", kind: "debt" },
    { id: "ms-4", date: ago(5, 17), title: "Meta Japão passou de 25%", kind: "goal" },
    { id: "ms-5", date: ago(2, 28), title: "Maior mês de economia: R$ 3.180", kind: "savings" },
    { id: "ms-6", date: ago(1, 6), title: "Reserva cobre 3 meses", kind: "reserve" },
  ];

  const memberSince = addMonths(currentMonth, -14);

  return {
    version: STATE_VERSION,
    user: { name: "Lucas", monthlyIncome: 8500, objective: "reserve", memberSince },
    accounts,
    transactions: txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    budgets: [
      { categoryId: "moradia", limit: 2250 },
      { categoryId: "alimentacao", limit: 1100 },
      { categoryId: "transporte", limit: 600 },
      { categoryId: "lazer", limit: 350 },
      { categoryId: "compras", limit: 300 },
      { categoryId: "saude", limit: 250 },
      { categoryId: "educacao", limit: 260 },
      { categoryId: "assinaturas", limit: 200 },
    ],
    goals: [
      {
        id: GOAL_JAPAN,
        name: "Viagem Japão",
        kind: "trip",
        target: 15000,
        targetDate: addMonths(currentMonth, 12),
        monthlyContribution: 600,
        initialSaved: round2(8420 - japanContrib),
        color: "#FF455D",
        createdAt: addMonths(currentMonth, -13),
        celebrated: [25, 50],
      },
      {
        id: "goal-notebook",
        name: "Notebook novo",
        kind: "computer",
        target: 7500,
        initialSaved: 0,
        monthlyContribution: 0,
        color: "#5B8CFF",
        createdAt: today,
        celebrated: [],
      },
    ],
    investments: [
      { id: "inv-1", name: "Tesouro IPCA+ 2035", class: "renda-fixa", invested: 9800, currentValue: 11240 },
      { id: "inv-2", name: "CDB 110% CDI", class: "renda-fixa", invested: 4500, currentValue: 4910 },
      { id: "inv-3", name: "BOVA11", class: "etfs", invested: 4200, currentValue: 4630 },
      { id: "inv-4", name: "Fundos imobiliários", class: "fiis", invested: 3600, currentValue: 3820 },
      { id: "inv-5", name: "IVVB11", class: "internacional", invested: 2400, currentValue: 3010 },
      { id: "inv-6", name: "Bitcoin", class: "cripto", invested: 900, currentValue: 840 },
    ],
    assets: [],
    liabilities: [],
    reserve: { accountId: ACC.reserve, monthlyCost: 4000, targetMonths: 6 },
    plan: { investments: 1000, goals: 1000 },
    netWorthHistory: history,
    milestones,
    lessons: [
      { id: "reserva-ideal", title: "Quanto de reserva você precisa?", category: "Reserva de emergência", minutes: 4, available: true, completed: false },
      { id: "orcamento-50-30-20", title: "O método 50/30/20, sem planilha", category: "Orçamento", minutes: 5, available: false, completed: false },
      { id: "juros-compostos", title: "Juros compostos em 3 minutos", category: "Investimentos", minutes: 3, available: false, completed: false },
      { id: "cartao-aliado", title: "Cartão de crédito como aliado", category: "Cartão de crédito", minutes: 6, available: false, completed: false },
      { id: "vieses", title: "Por que gastamos mais no fim de semana", category: "Finanças comportamentais", minutes: 4, available: false, completed: false },
    ],
  };
}

/**
 * A fresh account: same structure as the demo (accounts, lessons) but no history,
 * so the app starts with guided empty states instead of someone else's money.
 */
export function createEmptyState(today: ISODate, name: string): FinanceState {
  const demo = createDemoState(today);
  return {
    version: STATE_VERSION,
    user: { name, monthlyIncome: 0, objective: "organize", memberSince: today },
    accounts: demo.accounts.map((a) => ({ ...a, openingBalance: 0 })),
    transactions: [],
    budgets: [],
    goals: [],
    investments: [],
    assets: [],
    liabilities: [],
    reserve: { accountId: ACC.reserve, monthlyCost: 0, targetMonths: 6 },
    plan: { investments: 0, goals: 0 },
    netWorthHistory: [],
    milestones: [],
    lessons: demo.lessons,
  };
}
