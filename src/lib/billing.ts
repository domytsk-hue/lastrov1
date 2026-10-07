/**
 * Billing field rules (CPF, Brazilian phone, e-mail). Pure: the checkout form uses them for
 * instant feedback and the server runs the very same ones before anything reaches a gateway.
 * A valid CPF only means the check digits add up — it is not proof of identity.
 */

export type FieldResult = { ok: true; value: string } | { ok: false; error: string };

const digits = (raw: string) => raw.replace(/\D/g, "");

/** 11 digits with valid check digits; all-equal sequences (111.111.111-11) are rejected. */
export function isValidCpf(raw: string): boolean {
  const d = digits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** Normalized CPF: 11 digits, no punctuation. */
export function parseCpf(raw: string): FieldResult {
  const d = digits(raw ?? "");
  if (!d) return { ok: false, error: "Informe seu CPF." };
  if (d.length !== 11) return { ok: false, error: "O CPF tem 11 dígitos." };
  if (!isValidCpf(d)) return { ok: false, error: "Esse CPF não parece válido. Confira os números." };
  return { ok: true, value: d };
}

/** Live mask: 123.456.789-09 */
export function maskCpf(raw: string): string {
  const d = digits(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** "***.456.789-**" — for screens and logs. */
export function redactCpf(cpf: string): string {
  const d = digits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***";
}

/** Brazilian phone with area code → E.164 (+5511987654321). */
export function parsePhone(raw: string): FieldResult {
  let d = digits(raw ?? "");
  if (!d) return { ok: false, error: "Informe seu telefone." };
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return { ok: false, error: "Use o telefone com DDD, ex.: (11) 98765-4321." };
  if (Number(d.slice(0, 2)) < 11) return { ok: false, error: "Esse DDD não existe." };
  if (d.length === 11 && d[2] !== "9") return { ok: false, error: "Celulares com 11 dígitos começam com 9 depois do DDD." };
  return { ok: true, value: `+55${d}` };
}

/** Live mask: (11) 98765-4321 */
export function maskPhone(raw: string): string {
  let d = digits(raw);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(raw: string): FieldResult {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e) return { ok: false, error: "Informe seu e-mail." };
  if (e.length > 254 || !EMAIL_RE.test(e)) return { ok: false, error: "Esse e-mail não parece válido." };
  return { ok: true, value: e };
}

/** Full name for the charge: at least two words, letters only. */
export function parseBillingName(raw: string): FieldResult {
  const n = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { ok: false, error: "Informe seu nome completo." };
  if (n.length > 80) return { ok: false, error: "Use até 80 caracteres." };
  if (/[\d@<>]/.test(n)) return { ok: false, error: "O nome não deve ter números ou símbolos." };
  if (n.split(" ").length < 2) return { ok: false, error: "Informe nome e sobrenome, como no documento." };
  return { ok: true, value: n };
}
