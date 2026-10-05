import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoState, ACC } from "../data/mock.ts";
import { balances, budgetStatus, lastroScore, monthSummary, pulse, reserveStatus, insights, goalStatus, projectMonth } from "./finance.ts";
import type { Transaction } from "./types.ts";

for (const today of ["2026-10-05", "2026-10-21", "2026-02-28", "2027-01-01"]) {
  test(`demo snapshot is calibrated (${today})`, () => {
    const s = createDemoState(today);
    const b = balances(s, today);
    assert.equal(b.investments, 28450);
    assert.equal(b.reserve, 12400);
    assert.equal(b.netWorth, 52780);
    const g = goalStatus(s, s.goals[0], today);
    assert.equal(g.saved, 8420);
    const { score, pillars } = lastroScore(s, today);
    assert.ok(score > 30 && score < 100, `score ${score}`);
    assert.equal(pillars.length, 6);
    assert.ok(insights(s, today).length >= 3);
    pulse(s, today);
    projectMonth(s, today);
  });
}

test("a new expense flows through budgets, balances and pulse", () => {
  const today = "2026-10-05";
  const s = createDemoState(today);
  const before = { b: balances(s, today), food: budgetStatus(s, "alimentacao", today)!, m: monthSummary(s, today), p: pulse(s, today) };
  const tx: Transaction = { id: "t1", type: "expense", amount: 45, description: "Almoço", categoryId: "alimentacao", accountId: ACC.checking, date: today, recurring: "none", tags: [], createdAt: "" };
  const s2 = { ...s, transactions: [tx, ...s.transactions] };
  assert.equal(balances(s2, today).available, before.b.available - 45);
  assert.equal(budgetStatus(s2, "alimentacao", today)!.spent, before.food.spent + 45);
  assert.equal(monthSummary(s2, today).expenses, Math.round((before.m.expenses + 45) * 100) / 100);
  assert.equal(pulse(s2, today).spentToday, before.p.spentToday + 45);
});

test("reserve converts to days", () => {
  const s = createDemoState("2026-10-05");
  const r = reserveStatus(s, "2026-10-05");
  assert.equal(r.days, 93);
  assert.equal(r.target, 24000);
});
