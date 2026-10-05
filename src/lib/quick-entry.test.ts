import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickEntry } from "./quick-entry.ts";

const today = "2026-10-05";

test("45 almoço", () => {
  const r = parseQuickEntry("45 almoço", today);
  assert.equal(r.amount, 45);
  assert.equal(r.type, "expense");
  assert.equal(r.categoryId, "alimentacao");
  assert.equal(r.description, "Almoço");
  assert.equal(r.date, today);
});

test("gastei 89 no mercado", () => {
  const r = parseQuickEntry("gastei 89 no mercado", today);
  assert.equal(r.amount, 89);
  assert.equal(r.categoryId, "alimentacao");
  assert.equal(r.description, "Mercado");
});

test("120 gasolina ontem", () => {
  const r = parseQuickEntry("120 gasolina ontem", today);
  assert.equal(r.categoryId, "transporte");
  assert.equal(r.date, "2026-10-04");
});

test("recebi 3500 salário", () => {
  const r = parseQuickEntry("recebi 3500 salário", today);
  assert.equal(r.type, "income");
  assert.equal(r.amount, 3500);
  assert.equal(r.categoryId, "salario");
});

test("3.500 salário infers income", () => {
  const r = parseQuickEntry("3.500 salário", today);
  assert.equal(r.type, "income");
  assert.equal(r.amount, 3500);
});

test("coloca 300 na reserva", () => {
  const r = parseQuickEntry("coloca 300 na reserva", today);
  assert.equal(r.type, "transfer");
  assert.equal(r.destination, "reserve");
  assert.equal(r.amount, 300);
});

test("investi 500", () => {
  const r = parseQuickEntry("investi 500 tesouro", today);
  assert.equal(r.type, "investment");
  assert.equal(r.description, "Tesouro");
});

test("calculator inline + installments", () => {
  assert.equal(parseQuickEntry("125 + 32,50 + 18 mercado", today).amount, 175.5);
  const r = parseQuickEntry("1200 notebook em 4x", today);
  assert.equal(r.amount, 1200);
  assert.equal(r.installments, 4);
});

test("dia 28 refers to last month", () => {
  assert.equal(parseQuickEntry("50 uber dia 28", today).date, "2026-09-28");
  assert.equal(parseQuickEntry("50 uber dia 2", today).date, "2026-10-02");
});
