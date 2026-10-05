import type { ISODate } from "./types.ts";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Normalises the non-breaking space Intl inserts after "R$". */
const clean = (s: string) => s.replace(/ /g, " ");

/** R$ 1.250,00 */
export function formatBRL(value: number, opts: { cents?: boolean; sign?: boolean } = {}) {
  const { cents = true, sign = false } = opts;
  const v = Math.abs(value) < 0.005 ? 0 : value;
  const out = clean((cents ? brl : brlCompact).format(Math.abs(v)));
  if (v < 0) return `−${out}`;
  if (sign && v > 0) return `+${out}`;
  return out;
}

/** 1.250,00 — the number without the currency symbol. */
export function formatNumber(value: number, decimals = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** R$ 52,8 mil */
export function formatCompactBRL(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${formatNumber(value / 1_000_000, 1)} mi`;
  if (abs >= 10_000) return `R$ ${formatNumber(value / 1_000, 0)} mil`;
  if (abs >= 1_000) return `R$ ${formatNumber(value / 1_000, 1)} mil`;
  return formatBRL(value, { cents: false });
}

export function formatPercent(value: number, decimals = 0) {
  return `${formatNumber(value * 100, decimals)}%`;
}

/* ---------- dates ---------- */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Adds months, clamping the day to the end of the target month. */
export function addMonths(s: ISODate, months: number): ISODate {
  const d = parseISODate(s);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return toISODate(target);
}

export function monthKey(s: ISODate) {
  return s.slice(0, 7);
}

export function daysInMonth(s: ISODate) {
  const d = parseISODate(s);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function dayOfMonth(s: ISODate) {
  return Number(s.slice(8, 10));
}

export function startOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function diffInDays(a: ISODate, b: ISODate) {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** 05/10/2026 */
export function formatDate(s: ISODate) {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function monthName(s: ISODate | string, short = false) {
  const m = Number(s.slice(5, 7)) - 1;
  return (short ? MONTHS_SHORT : MONTHS)[m];
}

export function weekdayName(s: ISODate, short = false) {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[parseISODate(s).getDay()];
}

/** "Hoje", "Ontem", or "seg, 28 de set." */
export function formatRelativeDay(s: ISODate, today: ISODate) {
  const diff = diffInDays(today, s);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff === -1) return "Amanhã";
  const d = parseISODate(s);
  const sameYear = s.slice(0, 4) === today.slice(0, 4);
  return `${weekdayName(s, true)}, ${d.getDate()} de ${monthName(s, true)}${sameYear ? "" : ` de ${d.getFullYear()}`}`;
}

/** "maio de 2027" */
export function formatMonthYear(s: ISODate | string) {
  return `${monthName(s)} de ${s.slice(0, 4)}`;
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(hour: number) {
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
