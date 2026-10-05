/**
 * Lastro's financial engine. Pure functions over `FinanceState`.
 *
 * Everything takes an `asOf` date so we can compare "now" with any point in the past
 * (e.g. the same day last month, or the Lastro score a week ago). The UI never computes
 * money itself — it asks this module.
 */
import { getCategory } from "../data/categories.ts";
import {
  addDays,
  addMonths,
  dayOfMonth,
  daysInMonth,
  diffInDays,
  formatBRL,
  formatMonthYear,
  formatNumber,
  monthKey,
  parseISODate,
  round2,
  startOfMonth,
  weekdayName,
} from "./format.ts";
import type {
  Account,
  BudgetState,
  CategoryId,
  FinanceState,
  FinancialInsight,
  Goal,
  ISODate,
  NetWorthPoint,
  Transaction,
} from "./types.ts";

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export const upTo = (txs: Transaction[], asOf: ISODate) => txs.filter((t) => t.date <= asOf);

export const inMonth = (txs: Transaction[], month: string) => txs.filter((t) => t.date.startsWith(month));

export const sum = (txs: Transaction[]) => round2(txs.reduce((s, t) => s + t.amount, 0));

export const expensesOf = (txs: Transaction[]) => txs.filter((t) => t.type === "expense");

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

export function investmentsTotal(state: FinanceState, asOf?: ISODate) {
  const holdings = state.investments.reduce((s, i) => s + i.currentValue, 0);
  if (!asOf) return round2(holdings);
  // Investment contributions after `asOf` were not there yet.
  const later = state.transactions.filter((t) => t.type === "investment" && t.date > asOf);
  return round2(holdings - sum(later));
}

export function accountBalance(state: FinanceState, account: Account, asOf: ISODate) {
  if (account.type === "investment") return investmentsTotal(state, asOf);
  let bal = account.openingBalance;
  for (const t of state.transactions) {
    if (t.date > asOf) continue;
    if (t.accountId === account.id) bal += t.type === "income" ? t.amount : -t.amount;
    if (t.toAccountId === account.id && t.type === "transfer") bal += t.amount;
  }
  return round2(bal);
}

export interface Balances {
  /** Money free to spend: checking + cash. */
  available: number;
  reserve: number;
  goals: number;
  investments: number;
  cardDebt: number;
  otherAssets: number;
  otherLiabilities: number;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export function balances(state: FinanceState, asOf: ISODate): Balances {
  let available = 0,
    reserve = 0,
    goals = 0,
    cardDebt = 0;
  for (const a of state.accounts) {
    const b = accountBalance(state, a, asOf);
    if (a.type === "checking" || a.type === "cash") available += b;
    else if (a.type === "reserve") reserve += b;
    else if (a.type === "savings") goals += b;
    else if (a.type === "credit_card") cardDebt += -b;
  }
  const investments = investmentsTotal(state, asOf);
  const otherAssets = state.assets.reduce((s, a) => s + a.value, 0);
  const otherLiabilities = state.liabilities.reduce((s, l) => s + l.balance, 0);
  const assets = available + reserve + goals + investments + otherAssets;
  const liabilities = Math.max(0, cardDebt) + otherLiabilities;
  return {
    available: round2(available),
    reserve: round2(reserve),
    goals: round2(goals),
    investments: round2(investments),
    cardDebt: round2(Math.max(0, cardDebt)),
    otherAssets,
    otherLiabilities,
    assets: round2(assets),
    liabilities: round2(liabilities),
    netWorth: round2(assets - liabilities),
  };
}

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  invested: number;
  saved: number;
  byCategory: Map<CategoryId, number>;
}

export function monthSummary(state: FinanceState, asOf: ISODate): MonthSummary {
  const month = monthKey(asOf);
  const txs = inMonth(upTo(state.transactions, asOf), month);
  const byCategory = new Map<CategoryId, number>();
  let income = 0,
    expenses = 0,
    invested = 0,
    saved = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") {
      expenses += t.amount;
      const c = t.categoryId ?? "outros";
      byCategory.set(c, (byCategory.get(c) ?? 0) + t.amount);
    } else if (t.type === "investment") invested += t.amount;
    else if (t.type === "transfer" && (t.goalId || t.toAccountId === state.reserve.accountId)) saved += t.amount;
  }
  return { month, income: round2(income), expenses: round2(expenses), invested: round2(invested), saved: round2(saved), byCategory };
}

/** Same day of the previous month, clamped. */
export function sameDayLastMonth(asOf: ISODate) {
  return addMonths(asOf, -1);
}

/** Positive = spending less than at this point last month. */
export function paceVsLastMonth(state: FinanceState, asOf: ISODate) {
  const now = monthSummary(state, asOf).expenses;
  const then = monthSummary(state, sameDayLastMonth(asOf)).expenses;
  return round2(then - now);
}

/** Average spending per category over the last `months` complete months. */
export function categoryAverage(state: FinanceState, categoryId: CategoryId, asOf: ISODate, months = 3) {
  let total = 0;
  for (let i = 1; i <= months; i++) {
    const m = monthKey(addMonths(startOfMonth(asOf), -i));
    total += sum(inMonth(state.transactions, m).filter((t) => t.type === "expense" && t.categoryId === categoryId));
  }
  return round2(total / months);
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export interface BudgetStatus {
  categoryId: CategoryId;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  state: BudgetState;
  fixed: boolean;
  /** How much can be spent per day until the end of the month (including today). */
  dailyAllowance: number;
  daysLeft: number;
  projected: number;
  /** Where "today" sits in the month, 0..1 — the pace marker. */
  monthProgress: number;
}

export const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  critical: "Crítico",
  exceeded: "Excedido",
};

export function budgetStatus(state: FinanceState, categoryId: CategoryId, asOf: ISODate): BudgetStatus | null {
  const budget = state.budgets.find((b) => b.categoryId === categoryId);
  if (!budget) return null;
  const cat = getCategory(categoryId);
  const fixed = !!cat.fixed;
  const spent = monthSummary(state, asOf).byCategory.get(categoryId) ?? 0;
  const dim = daysInMonth(asOf);
  const day = dayOfMonth(asOf);
  const daysLeft = dim - day + 1;
  const remaining = round2(budget.limit - spent);
  const pct = budget.limit > 0 ? spent / budget.limit : 0;

  // Projection based on the recent daily pace (last 30 days) for variable costs.
  let projected = spent;
  if (!fixed) {
    // Recurring charges (e.g. the gym) are paid once a month, so they don't set the daily pace.
    const last30 = state.transactions.filter(
      (t) =>
        t.type === "expense" &&
        t.categoryId === categoryId &&
        t.recurring === "none" &&
        t.date <= asOf &&
        t.date > addDays(asOf, -30),
    );
    const daily = sum(last30) / 30;
    projected = round2(spent + daily * (daysLeft - 1));
  } else {
    projected = Math.max(spent, categoryAverage(state, categoryId, asOf));
  }

  let s: BudgetState = "healthy";
  if (spent > budget.limit) s = "exceeded";
  else if (!fixed) {
    // Early in the month the projection is noisy, so it can raise attention but not alarm.
    const trustProjection = day >= 10;
    if (pct >= 0.9 || (trustProjection && projected > budget.limit * 1.15)) s = "critical";
    else if (pct >= 0.75 || projected > budget.limit * 1.02) s = "attention";
  } else if (projected > budget.limit) s = "attention";

  return {
    categoryId,
    limit: budget.limit,
    spent: round2(spent),
    remaining,
    pct,
    state: s,
    fixed,
    dailyAllowance: round2(Math.max(0, remaining) / daysLeft),
    daysLeft,
    projected: round2(projected),
    monthProgress: day / dim,
  };
}

export function allBudgets(state: FinanceState, asOf: ISODate) {
  return state.budgets
    .map((b) => budgetStatus(state, b.categoryId, asOf)!)
    .filter(Boolean);
}

const STATE_SCORE: Record<BudgetState, number> = { healthy: 1, attention: 0.7, critical: 0.4, exceeded: 0.1 };
const STATE_RANK: Record<BudgetState, number> = { healthy: 0, attention: 1, critical: 2, exceeded: 3 };

export function budgetHealth(state: FinanceState, asOf: ISODate) {
  const list = allBudgets(state, asOf);
  // No budgets yet: we simply don't know — neither healthy nor alarming.
  if (!list.length) return 0.5;
  const weight = list.reduce((s, b) => s + b.limit, 0);
  return list.reduce((s, b) => s + STATE_SCORE[b.state] * b.limit, 0) / weight;
}

export function worstBudget(state: FinanceState, asOf: ISODate) {
  return allBudgets(state, asOf).sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state] || b.pct - a.pct)[0];
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

export interface MonthProjection {
  expectedIncome: number;
  projectedExpenses: number;
  plannedInvestRemaining: number;
  plannedGoalsRemaining: number;
  /** Money left at month end if the current pace continues. */
  free: number;
  savingsRate: number;
}

export function projectMonth(state: FinanceState, asOf: ISODate): MonthProjection {
  const ms = monthSummary(state, asOf);
  const expectedIncome = Math.max(ms.income, state.user.monthlyIncome);
  const statuses = allBudgets(state, asOf);
  const budgeted = new Set(statuses.map((b) => b.categoryId));
  let projectedExpenses = statuses.reduce((s, b) => s + Math.max(b.projected, b.spent), 0);
  for (const [c, v] of ms.byCategory) if (!budgeted.has(c)) projectedExpenses += v;
  const plannedInvestRemaining = Math.max(0, state.plan.investments - ms.invested);
  const plannedGoalsRemaining = Math.max(0, state.plan.goals - ms.saved);
  const free = expectedIncome - projectedExpenses - plannedInvestRemaining - plannedGoalsRemaining - ms.invested - ms.saved;
  const savingsRate = expectedIncome > 0 ? (expectedIncome - projectedExpenses) / expectedIncome : 0;
  return {
    expectedIncome: round2(expectedIncome),
    projectedExpenses: round2(projectedExpenses),
    plannedInvestRemaining: round2(plannedInvestRemaining),
    plannedGoalsRemaining: round2(plannedGoalsRemaining),
    free: round2(free),
    savingsRate,
  };
}

/* ------------------------------------------------------------------ */
/* Emergency reserve                                                   */
/* ------------------------------------------------------------------ */

export function reserveStatus(state: FinanceState, asOf: ISODate) {
  const account = state.accounts.find((a) => a.id === state.reserve.accountId);
  const balance = account ? accountBalance(state, account, asOf) : 0;
  const target = state.reserve.monthlyCost * state.reserve.targetMonths;
  const months = state.reserve.monthlyCost > 0 ? balance / state.reserve.monthlyCost : 0;
  const days = Math.floor(months * 30);
  const contributions = state.transactions.filter(
    (t) => t.type === "transfer" && t.toAccountId === state.reserve.accountId && t.date <= asOf,
  );
  const lastThree = contributions.filter((t) => t.date > addMonths(asOf, -3));
  const monthlyPace = sum(lastThree) / 3;
  const remaining = Math.max(0, target - balance);
  const monthsToGoal = monthlyPace > 0 ? Math.ceil(remaining / monthlyPace) : undefined;
  return {
    balance,
    target,
    progress: target > 0 ? Math.min(1, balance / target) : 0,
    months,
    days,
    targetDays: state.reserve.targetMonths * 30,
    remaining: round2(remaining),
    monthlyPace: round2(monthlyPace),
    eta: monthsToGoal !== undefined ? addMonths(asOf, monthsToGoal) : undefined,
    contributions,
  };
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export function goalSaved(state: FinanceState, goal: Goal, asOf?: ISODate) {
  const contribs = state.transactions.filter((t) => t.goalId === goal.id && (!asOf || t.date <= asOf));
  return round2(goal.initialSaved + sum(contribs));
}

export function goalStatus(state: FinanceState, goal: Goal, asOf: ISODate) {
  const saved = goalSaved(state, goal, asOf);
  const progress = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const remaining = Math.max(0, goal.target - saved);
  const recent = state.transactions.filter((t) => t.goalId === goal.id && t.date <= asOf && t.date > addMonths(asOf, -3));
  const pace = goal.monthlyContribution && goal.monthlyContribution > 0 ? goal.monthlyContribution : sum(recent) / 3;
  const monthsLeft = pace > 0 ? Math.ceil(remaining / pace) : undefined;
  const eta = remaining === 0 ? asOf : monthsLeft !== undefined ? addMonths(asOf, monthsLeft) : undefined;
  const onTrack = goal.targetDate && eta ? eta <= goal.targetDate : undefined;
  // What it would take to hit the target date.
  const monthsToTarget = goal.targetDate ? Math.max(1, Math.round(diffInDays(goal.targetDate, asOf) / 30.4)) : undefined;
  const neededMonthly = monthsToTarget ? round2(remaining / monthsToTarget) : undefined;
  const thisMonth = sum(inMonth(state.transactions, monthKey(asOf)).filter((t) => t.goalId === goal.id && t.date <= asOf));
  return { saved, progress, remaining: round2(remaining), pace: round2(pace), eta, onTrack, neededMonthly, thisMonth };
}

export const MILESTONES = [25, 50, 75, 100];

/** Milestones reached but not yet celebrated. */
export function pendingMilestone(goal: Goal, saved: number) {
  const pct = goal.target > 0 ? (saved / goal.target) * 100 : 0;
  const reached = MILESTONES.filter((m) => pct >= m && !goal.celebrated.includes(m));
  return reached.length ? reached[reached.length - 1] : undefined;
}

/* ------------------------------------------------------------------ */
/* Lastro score                                                        */
/* ------------------------------------------------------------------ */

export type PillarId = "reserva" | "orcamento" | "metas" | "investimentos" | "fluxo" | "dividas";

export interface Pillar {
  id: PillarId;
  label: string;
  short: string;
  value: number; // 0..1
  weight: number;
  color: string;
  detail: string;
  href: string;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export function lastroPillars(state: FinanceState, asOf: ISODate): Pillar[] {
  const r = reserveStatus(state, asOf);
  const bh = budgetHealth(state, asOf);
  const proj = projectMonth(state, asOf);
  const b = balances(state, asOf);

  // Goals: how close each goal is to where it should be by now.
  const goalScores = state.goals
    .filter((g) => goalSaved(state, g, asOf) > 0 || g.createdAt <= asOf)
    .map((g) => {
      const saved = goalSaved(state, g, asOf);
      if (!g.targetDate) return clamp(saved / g.target + 0.35);
      const total = Math.max(1, diffInDays(g.targetDate, g.createdAt));
      const elapsed = clamp(diffInDays(asOf, g.createdAt) / total);
      const expected = g.target * elapsed;
      return expected <= 0 ? 1 : clamp(saved / expected);
    });
  const goals = goalScores.length ? goalScores.reduce((s, v) => s + v, 0) / goalScores.length : 0.5;

  // Investments: consistency of monthly contributions + size relative to income.
  let monthsWithContribution = 0;
  for (let i = 0; i < 6; i++) {
    const m = monthKey(addMonths(asOf, -i));
    if (state.transactions.some((t) => t.type === "investment" && t.date <= asOf && t.date.startsWith(m))) monthsWithContribution++;
  }
  // A new account may not have told us its income yet; avoid dividing by zero.
  const income = Math.max(state.user.monthlyIncome, 1);
  const invest = 0.6 * (monthsWithContribution / 6) + 0.4 * clamp(b.investments / (6 * income));

  const flow = clamp(proj.savingsRate / 0.3);
  const debt = 1 - clamp(b.liabilities / (2 * income));

  const mo = (v: number) => formatNumber(v, 1);
  return [
    { id: "reserva", label: "Reserva", short: "RES", value: clamp(r.progress), weight: 0.22, color: "#00D99B", detail: `${mo(r.months)} de ${state.reserve.targetMonths} meses protegidos`, href: "/reserva" },
    { id: "orcamento", label: "Orçamento", short: "ORÇ", value: clamp(bh), weight: 0.18, color: "#8B6BFF", detail: `${allBudgets(state, asOf).filter((x) => x.state === "healthy").length} de ${state.budgets.length} categorias saudáveis`, href: "/orcamentos" },
    { id: "investimentos", label: "Investimentos", short: "INV", value: clamp(invest), weight: 0.18, color: "#5B8CFF", detail: `Aportes em ${monthsWithContribution} dos últimos 6 meses`, href: "/crescer" },
    { id: "metas", label: "Metas", short: "MET", value: clamp(goals), weight: 0.15, color: "#FFC234", detail: `${state.goals.length} ${state.goals.length === 1 ? "meta ativa" : "metas ativas"}`, href: "/metas" },
    { id: "fluxo", label: "Fluxo", short: "FLX", value: flow, weight: 0.15, color: "#4FE3C1", detail: `Sobra projetada de ${formatNumber(Math.max(0, proj.savingsRate) * 100, 0)}% da renda`, href: "/planejamento" },
    { id: "dividas", label: "Dívidas", short: "DÍV", value: clamp(debt), weight: 0.12, color: "#F4F6F8", detail: b.liabilities > 0 ? `${formatBRL(b.liabilities, { cents: false })} em aberto, sob controle` : "Nenhuma dívida em aberto", href: "/movimentacoes" },
  ];
}

export function lastroScore(state: FinanceState, asOf: ISODate) {
  const pillars = lastroPillars(state, asOf);
  const total = pillars.reduce((s, p) => s + p.value * p.weight, 0) / pillars.reduce((s, p) => s + p.weight, 0);
  return { score: Math.round(total * 100), pillars };
}

/** 0..1000 — progression level derived from the score, used for "Nível" copy. */
export function lastroLevel(score: number) {
  if (score >= 90) return { name: "Rocha", next: undefined };
  if (score >= 75) return { name: "Firme", next: 90 };
  if (score >= 60) return { name: "Sólido", next: 75 };
  if (score >= 40) return { name: "Em construção", next: 60 };
  return { name: "Fundação", next: 40 };
}

/* ------------------------------------------------------------------ */
/* Month momentum ("Seu mês")                                          */
/* ------------------------------------------------------------------ */

export function monthMomentum(state: FinanceState, asOf: ISODate) {
  const bh = budgetHealth(state, asOf);
  const proj = projectMonth(state, asOf);
  const flow = clamp(proj.savingsRate / 0.25);
  const st = streak(state, asOf);
  const habit = clamp(st / 7);
  return Math.round((0.5 * bh + 0.35 * flow + 0.15 * habit) * 100);
}

/* ------------------------------------------------------------------ */
/* Streak                                                              */
/* ------------------------------------------------------------------ */

/** Consecutive days (ending today or yesterday) with at least one movement registered. */
export function streak(state: FinanceState, asOf: ISODate) {
  const days = new Set(state.transactions.filter((t) => t.date <= asOf).map((t) => t.date));
  let d = days.has(asOf) ? asOf : addDays(asOf, -1);
  let count = 0;
  while (days.has(d)) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Pulso                                                               */
/* ------------------------------------------------------------------ */

/** Variable spending only: fixed bills would distort a "typical Monday". */
const variableExpenses = (txs: Transaction[]) => txs.filter((t) => t.type === "expense" && !getCategory(t.categoryId).fixed);

export function dailySpending(state: FinanceState, asOf: ISODate, days = 7) {
  const out: { date: ISODate; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    out.push({ date: d, value: sum(variableExpenses(state.transactions.filter((t) => t.date === d))) });
  }
  return out;
}

export function pulse(state: FinanceState, asOf: ISODate) {
  const today = state.transactions.filter((t) => t.date === asOf);
  const spentToday = sum(expensesOf(today));
  const variableToday = sum(variableExpenses(today));

  // Average for the same weekday over the last 8 weeks.
  let total = 0;
  for (let w = 1; w <= 8; w++) {
    const d = addDays(asOf, -7 * w);
    total += sum(variableExpenses(state.transactions.filter((t) => t.date === d)));
  }
  const weekdayAvg = round2(total / 8);
  const goalsToday = sum(today.filter((t) => t.type === "transfer" && (t.goalId || t.toAccountId === state.reserve.accountId)));
  const investedToday = sum(today.filter((t) => t.type === "investment"));

  const nwToday = balances(state, asOf).netWorth;
  const nwYesterday = balances(state, addDays(asOf, -1)).netWorth;
  const netWorthDelta = nwYesterday !== 0 ? (nwToday - nwYesterday) / Math.abs(nwYesterday) : 0;

  const worst = worstBudget(state, asOf);
  const diff = round2(weekdayAvg - variableToday);
  const wd = weekdayName(asOf);
  let insight: string;
  if (today.length === 0)
    insight =
      weekdayAvg > 0
        ? `Nada registrado ainda hoje. Sua ${wd.replace("-feira", "")} costuma custar ${formatBRL(weekdayAvg, { cents: false })}.`
        : "Nada registrado ainda hoje.";
  else if (diff > 10) insight = `Hoje você gastou ${formatBRL(diff, { cents: false })} a menos que sua média de ${wd}.`;
  else if (diff < -10) insight = `Hoje passou ${formatBRL(-diff, { cents: false })} da sua média de ${wd}. Amanhã equilibra.`;
  else insight = `Hoje está no seu ritmo normal de ${wd}.`;

  return {
    spentToday,
    variableToday,
    weekdayAvg,
    goalsToday: round2(goalsToday + investedToday),
    netWorthDelta,
    budgetState: worst?.state ?? "healthy",
    worstBudget: worst,
    insight,
    week: dailySpending(state, asOf, 7),
    count: today.length,
  };
}

/* ------------------------------------------------------------------ */
/* Net worth timeline                                                  */
/* ------------------------------------------------------------------ */

export function netWorthSeries(state: FinanceState, asOf: ISODate): NetWorthPoint[] {
  const current = monthKey(asOf);
  const past = state.netWorthHistory.filter((p) => p.month < current);
  return [...past, { month: current, value: balances(state, asOf).netWorth }];
}

export function netWorthChange(state: FinanceState, asOf: ISODate) {
  const series = netWorthSeries(state, asOf);
  const now = series[series.length - 1].value;
  const prev = series.length > 1 ? series[series.length - 2].value : now;
  const yearAgo = series[0].value;
  const record = series.length > 1 && now > 0 && series.slice(0, -1).every((p) => p.value < now);
  return { now, monthDelta: round2(now - prev), yearDelta: round2(now - yearAgo), record };
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export function insights(state: FinanceState, asOf: ISODate): FinancialInsight[] {
  const out: FinancialInsight[] = [];
  if (!state.transactions.some((t) => t.date <= asOf)) {
    return [
      {
        id: "welcome",
        tone: "neutral",
        title: "Seu mês começa aqui.",
        body: "Registre seu primeiro gasto e o Lastro começa a entender seu ritmo.",
      },
      {
        id: "welcome-budget",
        tone: "neutral",
        title: "Defina um orçamento para a categoria em que você mais gasta.",
        body: "É o jeito mais rápido de saber quanto dá para gastar por dia.",
        action: { label: "Criar orçamento", href: "/orcamentos" },
      },
    ];
  }
  const now = monthSummary(state, asOf);
  const then = monthSummary(state, sameDayLastMonth(asOf));
  const proj = projectMonth(state, asOf);
  const r = reserveStatus(state, asOf);
  const nw = netWorthChange(state, asOf);

  // Category movement vs the same point last month.
  type Move = { id: CategoryId; delta: number; pct: number };
  const moves: Move[] = [];
  for (const b of state.budgets) {
    if (getCategory(b.categoryId).fixed) continue;
    const a = now.byCategory.get(b.categoryId) ?? 0;
    const p = then.byCategory.get(b.categoryId) ?? 0;
    if (p < 80 || a === 0) continue;
    moves.push({ id: b.categoryId, delta: a - p, pct: (a - p) / p });
  }
  const best = [...moves].sort((a, b) => a.pct - b.pct)[0];
  const worst = [...moves].sort((a, b) => b.delta - a.delta)[0];

  if (proj.free > 0) {
    out.push({
      id: "projection",
      tone: "positive",
      title: `Neste ritmo, você termina ${monthNameOf(asOf)} com cerca de ${formatBRL(Math.round(proj.free / 10) * 10, { cents: false })} livres.`,
      body: "Já descontando aportes e metas planejados.",
      action: { label: "Ver planejamento", href: "/planejamento" },
    });
  } else {
    out.push({
      id: "projection",
      tone: "attention",
      title: `Neste ritmo, o mês fecha ${formatBRL(-proj.free, { cents: false })} acima do planejado.`,
      body: "Ajustar as categorias variáveis agora resolve com folga.",
      action: { label: "Ver orçamentos", href: "/orcamentos" },
    });
  }

  // Delivery is the most common "invisible" expense — worth its own comparison.
  const deliveryOf = (to: ISODate) =>
    sum(inMonth(upTo(state.transactions, to), monthKey(to)).filter((t) => t.type === "expense" && t.tags.includes("delivery")));
  const dNow = deliveryOf(asOf);
  const dThen = deliveryOf(sameDayLastMonth(asOf));
  if (dThen >= 60 && dNow < dThen * 0.9) {
    out.push({
      id: "delivery",
      tone: "positive",
      title: `Você gastou ${formatNumber((1 - dNow / dThen) * 100, 0)}% menos com delivery que neste ponto do mês passado.`,
      body: `${formatBRL(dThen - dNow, { cents: false })} que ficaram com você.`,
    });
  } else if (dNow > 60 && dNow > dThen * 1.25) {
    out.push({
      id: "delivery",
      tone: "attention",
      title: `Delivery já soma ${formatBRL(dNow, { cents: false })} este mês.`,
      body: `No mesmo ponto do mês passado eram ${formatBRL(dThen, { cents: false })}.`,
      action: { label: "Ver alimentação", href: "/orcamentos" },
    });
  }

  if (best && best.pct < -0.08) {
    out.push({
      id: `less-${best.id}`,
      tone: "positive",
      title: `Você gastou ${formatNumber(-best.pct * 100, 0)}% menos com ${getCategory(best.id).name.toLowerCase()} que no mesmo ponto do mês passado.`,
      body: `São ${formatBRL(-best.delta, { cents: false })} a mais no seu bolso.`,
    });
  }
  if (worst && worst.delta > 60) {
    out.push({
      id: `more-${worst.id}`,
      tone: "attention",
      title: `${getCategory(worst.id).name} está ${formatBRL(worst.delta, { cents: false })} acima do mesmo ponto do mês passado.`,
      body: "Vale olhar antes do fim de semana.",
      action: { label: "Ver categoria", href: "/orcamentos" },
    });
  }

  out.push({
    id: "reserve",
    tone: "neutral",
    title: `Sua reserva já cobre ${formatNumber(r.months, 1)} meses — cerca de ${r.days} dias do seu custo de vida.`,
    body: r.eta ? `No ritmo atual, chega a ${state.reserve.targetMonths} meses em ${formatMonthYear(r.eta)}.` : undefined,
    action: { label: "Ver reserva", href: "/reserva" },
  });

  if (nw.monthDelta > 0) {
    out.push({
      id: "networth",
      tone: "positive",
      title: `Seu patrimônio cresceu ${formatBRL(nw.monthDelta, { cents: false })} desde o mês passado.`,
      body: nw.record ? "É o maior valor que você já registrou." : undefined,
      action: { label: "Ver patrimônio", href: "/crescer" },
    });
  }

  const recurring = expensesOf(state.transactions).filter(
    (t) => t.categoryId === "assinaturas" && t.date > addMonths(asOf, -1) && t.date <= asOf,
  );
  const recurringTotal = sum(recurring);
  if (recurring.length >= 2) {
    out.push({
      id: "subscriptions",
      tone: "neutral",
      title: `Suas assinaturas somam ${formatBRL(recurringTotal, { cents: false })} por mês.`,
      body: `${formatBRL(recurringTotal * 12, { cents: false })} por ano. A maior é ${[...recurring].sort((a, b) => b.amount - a.amount)[0].description}.`,
      action: { label: "Revisar", href: "/movimentacoes?aba=recorrentes" },
    });
  }

  return out;
}

function monthNameOf(asOf: ISODate) {
  return parseISODate(asOf).toLocaleDateString("pt-BR", { month: "long" });
}
