import { addMonths, round2, uid } from "../../lib/format.ts";
import type {
  Budget,
  CategoryId,
  EmergencyReserve,
  FinanceState,
  Goal,
  InvestmentClass,
  MonthlyPlan,
  Transaction,
  User,
} from "../domain/types.ts";

export type TransactionInput = Omit<Transaction, "id" | "createdAt" | "installments"> & { installments?: number };

export type Action =
  | { type: "transaction/add"; input: TransactionInput }
  | { type: "transaction/update"; id: string; input: TransactionInput }
  | { type: "transaction/delete"; id: string }
  | { type: "transaction/restore"; txs: Transaction[] }
  | { type: "budget/set"; budget: Budget }
  | { type: "budget/remove"; categoryId: CategoryId }
  | { type: "goal/add"; goal: Omit<Goal, "id" | "celebrated" | "createdAt"> & { createdAt: string } }
  | { type: "goal/update"; id: string; patch: Partial<Goal> }
  | { type: "goal/delete"; id: string }
  | { type: "goal/celebrated"; id: string; milestone: number }
  | { type: "reserve/set"; patch: Partial<EmergencyReserve> }
  | { type: "user/set"; patch: Partial<User> }
  | { type: "plan/set"; plan: MonthlyPlan }
  | { type: "lesson/complete"; id: string }
  | { type: "state/replace"; state: FinanceState };

const CLASS_NAME: Record<InvestmentClass, string> = {
  "renda-fixa": "Renda fixa",
  acoes: "Ações",
  fiis: "Fundos imobiliários",
  etfs: "ETFs",
  fundos: "Fundos",
  cripto: "Cripto",
  internacional: "Internacional",
  outros: "Outros",
};

/** Investment transactions move money into the portfolio (and back out when deleted). */
function applyInvestment(state: FinanceState, tx: Transaction, direction: 1 | -1): FinanceState {
  if (tx.type !== "investment") return state;
  const cls = tx.investmentClass ?? "renda-fixa";
  const investments = [...state.investments];
  let idx = investments.findIndex((i) => i.class === cls);
  if (idx < 0) {
    investments.push({ id: uid("inv"), name: CLASS_NAME[cls], class: cls, invested: 0, currentValue: 0 });
    idx = investments.length - 1;
  }
  const h = investments[idx];
  investments[idx] = {
    ...h,
    invested: round2(Math.max(0, h.invested + direction * tx.amount)),
    currentValue: round2(Math.max(0, h.currentValue + direction * tx.amount)),
  };
  return { ...state, investments };
}

function buildTransactions(input: TransactionInput): Transaction[] {
  const createdAt = new Date().toISOString();
  const { installments, ...rest } = input;
  if (!installments || installments < 2) {
    return [{ ...rest, amount: round2(rest.amount), id: uid("tx"), createdAt }];
  }
  const groupId = uid("grp");
  return Array.from({ length: installments }, (_, i) => ({
    ...rest,
    id: uid("tx"),
    amount: round2(rest.amount),
    date: addMonths(rest.date, i),
    description: rest.description,
    installments: { groupId, current: i + 1, total: installments },
    createdAt,
  }));
}

const byDateDesc = (a: Transaction, b: Transaction) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1;

export function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case "transaction/add": {
      const txs = buildTransactions(action.input);
      let next: FinanceState = { ...state, transactions: [...txs, ...state.transactions].sort(byDateDesc) };
      for (const t of txs) next = applyInvestment(next, t, 1);
      return next;
    }
    case "transaction/update": {
      const prev = state.transactions.find((t) => t.id === action.id);
      if (!prev) return state;
      const { installments: _ignored, ...input } = action.input;
      const updated: Transaction = { ...prev, ...input, amount: round2(input.amount) };
      let next = applyInvestment(state, prev, -1);
      next = applyInvestment(next, updated, 1);
      return { ...next, transactions: next.transactions.map((t) => (t.id === action.id ? updated : t)).sort(byDateDesc) };
    }
    case "transaction/delete": {
      const prev = state.transactions.find((t) => t.id === action.id);
      if (!prev) return state;
      const next = applyInvestment(state, prev, -1);
      return { ...next, transactions: next.transactions.filter((t) => t.id !== action.id) };
    }
    case "transaction/restore": {
      let next: FinanceState = { ...state, transactions: [...action.txs, ...state.transactions].sort(byDateDesc) };
      for (const t of action.txs) next = applyInvestment(next, t, 1);
      return next;
    }
    case "budget/set": {
      const exists = state.budgets.some((b) => b.categoryId === action.budget.categoryId);
      return {
        ...state,
        budgets: exists
          ? state.budgets.map((b) => (b.categoryId === action.budget.categoryId ? action.budget : b))
          : [...state.budgets, action.budget],
      };
    }
    case "budget/remove":
      return { ...state, budgets: state.budgets.filter((b) => b.categoryId !== action.categoryId) };
    case "goal/add":
      return { ...state, goals: [...state.goals, { ...action.goal, id: uid("goal"), celebrated: [] }] };
    case "goal/update":
      return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)) };
    case "goal/delete":
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        // Money saved for the goal goes back to the main account: drop the goal link but keep history.
        transactions: state.transactions.map((t) => (t.goalId === action.id ? { ...t, goalId: undefined } : t)),
      };
    case "goal/celebrated":
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.id ? { ...g, celebrated: [...new Set([...g.celebrated, ...[25, 50, 75, 100].filter((m) => m <= action.milestone)])] } : g,
        ),
      };
    case "reserve/set":
      return { ...state, reserve: { ...state.reserve, ...action.patch } };
    case "user/set":
      return { ...state, user: { ...state.user, ...action.patch } };
    case "plan/set":
      return { ...state, plan: action.plan };
    case "lesson/complete":
      return { ...state, lessons: state.lessons.map((l) => (l.id === action.id ? { ...l, completed: true } : l)) };
    case "state/replace":
      return action.state;
  }
}
