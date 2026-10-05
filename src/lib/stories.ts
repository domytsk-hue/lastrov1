/**
 * Human meaning for financial numbers. These helpers only *phrase* what finance.ts computes:
 * "3,1 meses protegidos" instead of "Reserva 52%".
 */
import { getCategory } from "../data/categories.ts";
import {
  allBudgets,
  balances,
  goalStatus,
  monthSummary,
  projectMonth,
  pulse,
  reserveStatus,
  type PillarId,
} from "./finance.ts";
import { addDays, formatBRL, formatCompactBRL, formatNumber, startOfMonth } from "./format.ts";
import type { FinanceState, ISODate } from "./types.ts";

const brl = (n: number) => formatBRL(n, { cents: false });

export interface PillarStory {
  /** Big value for the orbit center, e.g. "3,1". */
  big: string;
  /** Unit under it, e.g. "meses protegidos". */
  unit: string;
  /** One short sentence. */
  sentence: string;
  delta?: { text: string; positive: boolean };
  href: string;
  cta: string;
}

export function pillarStory(state: FinanceState, today: ISODate, id: PillarId): PillarStory {
  switch (id) {
    case "reserva": {
      const r = reserveStatus(state, today);
      const before = reserveStatus(state, addDays(startOfMonth(today), -1));
      const d = r.months - before.months;
      return {
        big: formatNumber(r.months, 1),
        unit: r.months === 1 ? "mês protegido" : "meses protegidos",
        sentence: state.reserve.monthlyCost > 0 ? `${r.days} dias de tranquilidade. A meta é ${state.reserve.targetMonths} meses.` : "Defina seu custo essencial para medir a proteção.",
        delta: Math.abs(d) >= 0.05 ? { text: `${d > 0 ? "+" : "−"}${formatNumber(Math.abs(d), 1)} este mês`, positive: d > 0 } : undefined,
        href: "/reserva",
        cta: "Ver reserva",
      };
    }
    case "orcamento": {
      const list = allBudgets(state, today).filter((b) => !b.fixed);
      const free = list.reduce((s, b) => s + Math.max(0, b.remaining), 0);
      const daily = list.reduce((s, b) => s + b.dailyAllowance, 0);
      const attention = list.filter((b) => b.state !== "healthy");
      return {
        big: list.length ? formatCompactBRL(free).replace("R$ ", "") : "—",
        unit: list.length ? "livres no mês" : "sem orçamento",
        sentence: list.length
          ? attention.length
            ? `${getCategory(attention[0].categoryId).name} merece atenção. No geral, ≈ ${brl(daily)} por dia.`
            : `Tudo no ritmo. Você pode gastar cerca de ${brl(daily)} por dia.`
          : "Crie um orçamento e veja quanto dá para gastar por dia.",
        href: "/orcamentos",
        cta: "Ver orçamentos",
      };
    }
    case "investimentos": {
      const b = balances(state, today);
      const ms = monthSummary(state, today);
      return {
        big: formatCompactBRL(b.investments).replace("R$ ", ""),
        unit: "investidos",
        sentence: ms.invested > 0 ? `Aporte de ${brl(ms.invested)} feito este mês. Constância é o que importa.` : "Nenhum aporte este mês ainda.",
        delta: ms.invested > 0 ? { text: `+${brl(ms.invested)} este mês`, positive: true } : undefined,
        href: "/crescer",
        cta: "Ver investimentos",
      };
    }
    case "metas": {
      const g = state.goals[0];
      if (!g) return { big: "—", unit: "sem metas", sentence: "Dê um nome ao que você quer conquistar.", href: "/metas", cta: "Criar meta" };
      const s = goalStatus(state, g, today);
      return {
        big: `${Math.round(s.progress * 100)}%`,
        unit: g.name,
        sentence: s.eta ? `No seu ritmo, chega em ${new Date(s.eta + "T12:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.` : "Defina um aporte mensal para ver a data.",
        delta: s.thisMonth > 0 ? { text: `+${brl(s.thisMonth)} este mês`, positive: true } : undefined,
        href: "/metas",
        cta: "Ver metas",
      };
    }
    case "fluxo": {
      const p = projectMonth(state, today);
      return {
        big: formatCompactBRL(Math.max(0, p.free)).replace("R$ ", ""),
        unit: "devem sobrar",
        sentence: p.free >= 0 ? "Neste ritmo, já contando metas e aportes." : `Neste ritmo, o mês fecha ${brl(-p.free)} acima do plano.`,
        href: "/planejamento",
        cta: "Ver plano",
      };
    }
    case "dividas": {
      const b = balances(state, today);
      return {
        big: b.liabilities > 0 ? formatCompactBRL(b.liabilities).replace("R$ ", "") : "Zero",
        unit: b.liabilities > 0 ? "na fatura" : "dívidas",
        sentence: b.liabilities > 0 ? "Fatura do mês, sem rotativo. Sob controle." : "Nada em aberto. Base limpa.",
        href: "/movimentacoes?aba=contas",
        cta: "Ver contas",
      };
    }
  }
}

/** One calm sentence for the day. */
export function pulseMood(state: FinanceState, today: ISODate) {
  const p = pulse(state, today);
  const diff = p.weekdayAvg - p.variableToday;
  const wd = new Date(today + "T12:00").toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
  if (p.count === 0) return { title: "Dia em branco.", detail: p.weekdayAvg > 0 ? `Sua ${wd} costuma custar ${brl(p.weekdayAvg)}.` : "Nada registrado ainda.", p };
  if (diff > 10) return { title: "Hoje está tranquilo.", detail: `${brl(diff)} abaixo da sua média de ${wd}.`, p };
  if (diff < -10) return { title: "Hoje pediu um pouco mais.", detail: `${brl(-diff)} acima da sua média de ${wd}. Amanhã equilibra.`, p };
  return { title: "Hoje você está no ritmo.", detail: `Bem perto da sua média de ${wd}.`, p };
}

/** Daily spending capacity across variable budgets — the "consequence" number. */
export function dailyCapacity(state: FinanceState, today: ISODate) {
  return allBudgets(state, today)
    .filter((b) => !b.fixed)
    .reduce((s, b) => s + b.dailyAllowance, 0);
}
