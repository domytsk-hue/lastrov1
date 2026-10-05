import { streak, sum } from "./finance.ts";
import { addDays, parseISODate } from "./format.ts";
import type { FinanceState, ISODate, Mission } from "./types.ts";

/** Monday of the week containing `d`. */
export function startOfWeek(d: ISODate) {
  const wd = parseISODate(d).getDay();
  return addDays(d, -((wd + 6) % 7));
}

/** Weekly missions, derived from real behaviour — never fake currency. */
export function weeklyMissions(state: FinanceState, today: ISODate): (Mission & { reward: string; done: boolean })[] {
  const week = startOfWeek(today);
  const inWeek = (from: ISODate, to: ISODate) => state.transactions.filter((t) => t.date >= from && t.date <= to);
  const thisWeek = inWeek(week, today);
  const lastWeekSameSpan = inWeek(addDays(week, -7), addDays(today, -7));

  const reserveThisWeek = sum(thisWeek.filter((t) => t.type === "transfer" && t.toAccountId === state.reserve.accountId));
  const deliveryNow = sum(thisWeek.filter((t) => t.tags.includes("delivery")));
  const deliveryBefore = sum(lastWeekSameSpan.filter((t) => t.tags.includes("delivery")));
  const lessons = state.lessons.filter((l) => l.completed).length;
  const s = Math.min(7, streak(state, today));

  const list = [
    { id: "streak", title: "Registrar movimentações por 7 dias", progress: s, target: 7, unit: "dias", reward: "Insight semanal avançado" },
    { id: "reserve", title: "Guardar R$ 50 na reserva", progress: Math.min(50, reserveThisWeek), target: 50, unit: "reais", reward: "Marco na linha do tempo" },
    { id: "lesson", title: "Concluir uma aula da Academy", progress: Math.min(1, lessons), target: 1, unit: "aula", reward: "Tema Grafite Profundo" },
    {
      id: "delivery",
      title: "Gastar menos com delivery que na semana passada",
      progress: deliveryNow <= deliveryBefore ? 1 : 0,
      target: 1,
      unit: deliveryBefore > 0 ? `até R$ ${Math.round(deliveryBefore)}` : "sem delivery",
      reward: "Conquista: Cozinha de casa",
    },
  ];
  return list.map((m) => ({ ...m, done: m.progress >= m.target }));
}
