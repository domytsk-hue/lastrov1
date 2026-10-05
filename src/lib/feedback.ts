/**
 * The one-line consequence shown after every movement.
 * Every action in Lastro should answer "what did this change?".
 */
import { getCategory } from "../data/categories.ts";
import { budgetStatus, goalStatus, investmentsTotal, reserveStatus, balances } from "./finance.ts";
import { formatBRL, formatMonthYear, formatNumber } from "./format.ts";
import type { FinanceState, ISODate, Transaction } from "./types.ts";

export interface Feedback {
  title: string;
  body?: string;
  tone: "success" | "neutral" | "attention";
}

const brl = (n: number) => formatBRL(n, { cents: false });

export function feedbackFor(tx: Pick<Transaction, "type" | "amount" | "categoryId" | "goalId" | "toAccountId" | "date">, next: FinanceState, today: ISODate): Feedback {
  const asOf = tx.date > today ? tx.date : today;

  if (tx.type === "expense") {
    const cat = getCategory(tx.categoryId);
    const b = tx.categoryId ? budgetStatus(next, tx.categoryId, asOf) : null;
    if (!b) return { title: `${cat.name}: ${brl(tx.amount)} registrado`, tone: "success" };
    if (b.state === "exceeded") {
      return {
        title: `${cat.name} passou ${brl(-b.remaining)} do planejado.`,
        body: "Ainda dá para ajustar o restante do mês.",
        tone: "attention",
      };
    }
    return {
      title: `${cat.name}: ${brl(b.remaining)} disponíveis`,
      body: b.fixed ? `${formatNumber(b.pct * 100, 0)}% do orçamento usado.` : `Cerca de ${brl(b.dailyAllowance)}/dia até o fim do mês.`,
      tone: b.state === "healthy" ? "success" : "attention",
    };
  }

  if (tx.type === "income") {
    return { title: `Receita de ${brl(tx.amount)} registrada`, body: `Disponível agora: ${brl(balances(next, asOf).available)}.`, tone: "success" };
  }

  if (tx.type === "investment") {
    return { title: `Aporte de ${brl(tx.amount)} registrado`, body: `Seus investimentos somam ${brl(investmentsTotal(next, asOf))}.`, tone: "success" };
  }

  if (tx.goalId) {
    const goal = next.goals.find((g) => g.id === tx.goalId);
    if (goal) {
      const g = goalStatus(next, goal, asOf);
      return {
        title: `${goal.name}: ${formatNumber(g.progress * 100, 0)}%`,
        body: g.remaining === 0 ? "Meta completa." : g.eta ? `Faltam ${brl(g.remaining)}. No ritmo atual: ${formatMonthYear(g.eta)}.` : `Faltam ${brl(g.remaining)}.`,
        tone: "success",
      };
    }
  }

  if (tx.toAccountId === next.reserve.accountId) {
    const r = reserveStatus(next, asOf);
    return { title: `Reserva: +${brl(tx.amount)}`, body: `Agora cobre ${r.days} dias do seu custo de vida.`, tone: "success" };
  }

  return { title: `Transferência de ${brl(tx.amount)} registrada`, tone: "success" };
}
