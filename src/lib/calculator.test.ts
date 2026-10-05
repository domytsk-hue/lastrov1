import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parseLocaleNumber } from "./calculator.ts";

test("parses pt-BR and en-US numbers", () => {
  assert.equal(parseLocaleNumber("1.250,00"), 1250);
  assert.equal(parseLocaleNumber("32,50"), 32.5);
  assert.equal(parseLocaleNumber("32.50"), 32.5);
  assert.equal(parseLocaleNumber("1.250"), 1250);
});

test("sums and precedence", () => {
  assert.equal(evaluate("125 + 32,50 + 18")?.value, 175.5);
  assert.equal(evaluate("10 + 2 × 3")?.value, 16);
  assert.equal(evaluate("(10 + 2) * 3")?.value, 36);
  assert.equal(evaluate("100 ÷ 3")?.value, 33.33);
  assert.equal(evaluate("3x45")?.value, 135);
});

test("percent", () => {
  assert.equal(evaluate("200 - 10%")?.value, 180);
  assert.equal(evaluate("200 + 10%")?.value, 220);
  assert.equal(evaluate("200 * 10%")?.value, 20);
});

test("installments shortcut", () => {
  const r = evaluate("R$200 / 4");
  assert.deepEqual(r?.installments, { total: 200, count: 4, each: 50 });
});

test("invalid input", () => {
  assert.equal(evaluate(""), null);
  assert.equal(evaluate("abc"), null);
  assert.equal(evaluate("10 / 0"), null);
  assert.equal(evaluate("45 +")?.value, 45);
});
