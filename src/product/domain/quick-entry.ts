/**
 * Natural-language quick entry.
 *
 *   "45 almoço"                → expense, R$45, Alimentação, today
 *   "gastei 89 no mercado"     → expense, R$89, Alimentação
 *   "120 gasolina ontem"       → expense, R$120, Transporte, yesterday
 *   "recebi 3500 salário"      → income, R$3.500, Salário
 *   "coloca 300 na reserva"    → transfer to the emergency reserve
 *   "investi 500"              → investment
 *   "125 + 32,50 + 18 mercado" → expense, R$175,50 (calculator inline)
 *
 * Pure and deterministic, so it can later be swapped for (or combined with) an AI model
 * that returns the same `ParsedEntry` shape.
 */
import { CATEGORIES } from "../data/categories.ts";
import { evaluate } from "./calculator.ts";
import { addDays, capitalize, dayOfMonth, toISODate, parseISODate } from "../../lib/format.ts";
import type { CategoryId, ISODate, TransactionType } from "./types.ts";

export interface ParsedEntry {
  amount?: number;
  type: TransactionType;
  categoryId?: CategoryId;
  description: string;
  date: ISODate;
  /** Transfer destination hint. */
  destination?: "reserve";
  installments?: number;
  /** Which fields were inferred, for UI feedback. */
  inferred: Array<"amount" | "type" | "category" | "date">;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const INCOME_VERBS = ["recebi", "ganhei", "entrou", "caiu", "receita"];
const INVEST_VERBS = ["investi", "aportei", "aporte", "investir", "apliquei", "invest"];
const RESERVE_WORDS = ["reserva", "emergencia"];
const RESERVE_VERBS = ["coloca", "coloquei", "guardei", "guarda", "separei", "transferi", "poupei"];
const EXPENSE_VERBS = ["gastei", "paguei", "comprei", "gasto"];
const STOP_WORDS = new Set(["no", "na", "nos", "nas", "de", "do", "da", "em", "com", "o", "a", "um", "uma", "pra", "para", "pro", "reais", "real", "r$", "rs", "e"]);

export function parseQuickEntry(input: string, today: ISODate): ParsedEntry {
  const inferred: ParsedEntry["inferred"] = [];
  let text = ` ${input.trim()} `;

  /* ---- date (these words carry no accents, so match the raw text) ---- */
  let date = today;
  const rel: Array<[RegExp, number]> = [
    [/\banteontem\b/i, -2],
    [/\bontem\b/i, -1],
    [/\bhoje\b/i, 0],
  ];
  const relHit = rel.find(([re]) => re.test(text));
  const dayHit = text.match(/\bdia (\d{1,2})\b/i);
  if (relHit) {
    date = addDays(today, relHit[1]);
    text = text.replace(relHit[0], " ");
  } else if (dayHit) {
    const d = Math.min(Number(dayHit[1]), 31);
    const base = parseISODate(today);
    // "dia 28" on the 5th refers to last month.
    const monthOffset = d > dayOfMonth(today) ? -1 : 0;
    const last = new Date(base.getFullYear(), base.getMonth() + monthOffset + 1, 0).getDate();
    date = toISODate(new Date(base.getFullYear(), base.getMonth() + monthOffset, Math.min(d, last)));
    text = text.replace(dayHit[0], " ");
  }
  if (date !== today) inferred.push("date");

  /* ---- installments: "em 4x", "4x de" ---- */
  let installments: number | undefined;
  const inst = text.match(/\b(?:em\s+)?(\d{1,2})\s?x\b(?!\s*\d)/i);
  if (inst && !/\d\s?x\s?\d/i.test(text)) {
    const n = Number(inst[1]);
    if (n >= 2 && n <= 48) {
      installments = n;
      text = text.replace(inst[0], " ");
    }
  }

  /* ---- amount: the first arithmetic run ---- */
  let amount: number | undefined;
  const amountMatch = text.match(/R?\$?\s?\d[\d.,]*(?:\s*[+\-−*×÷/x]\s*\d[\d.,]*%?)*/i);
  if (amountMatch) {
    const res = evaluate(amountMatch[0]);
    if (res && res.value > 0) {
      amount = res.value;
      inferred.push("amount");
      if (!installments && res.installments) {
        // "1200/4 notebook" → 4 installments of 300
        installments = res.installments.count;
      }
      text = text.replace(amountMatch[0], " ");
    }
  }

  const n = ` ${normalize(text).trim()} `;
  const words = n.split(/\s+/).filter(Boolean);
  const has = (list: string[]) => list.some((w) => words.includes(w) || n.includes(` ${w} `));

  /* ---- type ---- */
  let type: TransactionType = "expense";
  let destination: ParsedEntry["destination"];
  let categoryId: CategoryId | undefined;

  if (has(INCOME_VERBS)) {
    type = "income";
    inferred.push("type");
  } else if (has(INVEST_VERBS)) {
    type = "investment";
    inferred.push("type");
  } else if (RESERVE_WORDS.some((w) => n.includes(w)) && (has(RESERVE_VERBS) || words.length <= 3)) {
    type = "transfer";
    destination = "reserve";
    inferred.push("type");
  }

  /* ---- category ---- */
  const pool = CATEGORIES.filter((c) => (type === "income" ? c.kind === "income" : c.kind === "expense"));
  let best: { id: CategoryId; score: number } | undefined;
  for (const c of pool) {
    for (const kw of c.keywords) {
      const k = normalize(kw);
      if (k.includes(" ") ? n.includes(k) : words.includes(k) || words.some((w) => w.startsWith(k) && k.length >= 4)) {
        const score = k.length;
        if (!best || score > best.score) best = { id: c.id, score };
      }
    }
  }
  // Income keywords can also imply the type: "3500 salário".
  if (type === "expense") {
    for (const c of CATEGORIES.filter((c) => c.kind === "income")) {
      if (c.keywords.some((kw) => words.includes(normalize(kw)))) {
        type = "income";
        best = { id: c.id, score: 99 };
        inferred.push("type");
        break;
      }
    }
  }
  if (type === "expense" || type === "income") {
    if (best) {
      categoryId = best.id;
      inferred.push("category");
    } else if (type === "income") {
      categoryId = "outras-receitas";
    }
  }

  /* ---- description: what remains, minus verbs and stop words ---- */
  const drop = new Set([...INCOME_VERBS, ...INVEST_VERBS, ...RESERVE_VERBS, ...EXPENSE_VERBS, ...STOP_WORDS]);
  const original = text.split(/\s+/).filter(Boolean);
  const descWords = original.filter((w) => !drop.has(normalize(w)));
  let description = capitalize(descWords.join(" ").trim());
  if (!description) {
    if (destination === "reserve") description = "Reserva de emergência";
    else if (type === "investment") description = "Aporte";
    else if (categoryId) description = CATEGORIES.find((c) => c.id === categoryId)!.name;
  }
  if (destination === "reserve" && /^reserva$/i.test(description)) description = "Reserva de emergência";

  return { amount, type, categoryId, description, date, destination, installments, inferred };
}
