/**
 * Authentication rules for Lastro: identifiers (email or Brazilian phone), names, passwords
 * and password hashing. Pure and framework-free, so the same rules can run on a future API.
 */

export type IdentifierKind = "email" | "phone";

export interface Identifier {
  kind: IdentifierKind;
  /** Canonical form used as the account key: lowercase email or +55DDDNUMBER. */
  value: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accepts "Nome@Email.com", "(11) 98765-4321", "11987654321" or "+55 11 98765-4321". */
export function parseIdentifier(raw: string): Result<Identifier> {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Informe seu e-mail ou telefone." };

  if (input.includes("@") || /[a-z]/i.test(input)) {
    const email = input.toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Esse e-mail não parece válido." };
    return { ok: true, value: { kind: "email", value: email } };
  }

  let digits = input.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) {
    return { ok: false, error: "Use o telefone com DDD, ex.: (11) 98765-4321." };
  }
  if (Number(digits.slice(0, 2)) < 11) return { ok: false, error: "Esse DDD não existe." };
  if (digits.length === 11 && digits[2] !== "9") return { ok: false, error: "Celulares com 11 dígitos começam com 9 depois do DDD." };
  return { ok: true, value: { kind: "phone", value: `+55${digits}` } };
}

/** The sign-up e-mail (required): lowercase. */
export function parseEmailAddress(raw: string): Result<string> {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Informe seu e-mail." };
  const r = parseIdentifier(input);
  if (!r.ok) return r;
  if (r.value.kind !== "email") return { ok: false, error: "Informe um e-mail válido, ex.: voce@email.com." };
  return { ok: true, value: r.value.value };
}

/** The sign-up phone (required): Brazilian, with DDD → +55DDDNUMBER. */
export function parsePhoneNumber(raw: string): Result<string> {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Informe seu celular com DDD." };
  if (/[a-z@]/i.test(input)) return { ok: false, error: "Use só números, ex.: (11) 98765-4321." };
  const r = parseIdentifier(input);
  if (!r.ok) return r;
  return { ok: true, value: r.value.value };
}

/** Live mask while typing a phone; leaves anything that looks like an email untouched. */
export function maskIdentifierInput(raw: string): string {
  if (/[a-z@]/i.test(raw)) {
    // An email that started with digits got masked like a phone — undo the mask.
    return /^\(\d/.test(raw) ? raw.replace(/[()\s-]/g, "") : raw;
  }
  if (raw.trim().startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return raw.replace(/[^\d\s()-]/g, "");
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "+5511987654321" → "(11) 98765-4321" */
export function formatIdentifier(id: Identifier): string {
  if (id.kind === "email") return id.value;
  return maskIdentifierInput(id.value.slice(3));
}

export function validateName(raw: string): Result<string> {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Como podemos te chamar?" };
  if (name.length > 60) return { ok: false, error: "Use até 60 caracteres." };
  if (/\d/.test(name)) return { ok: false, error: "O nome não deve ter números." };
  return { ok: true, value: name };
}

export interface PasswordCheck {
  id: "length" | "letter" | "number";
  label: string;
  ok: boolean;
}

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: "length", label: "8 caracteres ou mais", ok: pw.length >= 8 },
    { id: "letter", label: "Uma letra", ok: /[a-zà-ú]/i.test(pw) },
    { id: "number", label: "Um número", ok: /\d/.test(pw) },
  ];
}

export function validatePassword(pw: string): Result<string> {
  if (pw.length > 128) return { ok: false, error: "Use até 128 caracteres." };
  const failed = passwordChecks(pw).find((c) => !c.ok);
  if (failed) return { ok: false, error: `A senha precisa de: ${failed.label.toLowerCase()}.` };
  return { ok: true, value: pw };
}

/* ---------------- Hashing (PBKDF2-SHA256 via Web Crypto) ---------------- */

export const PBKDF2_ITERATIONS = 210_000;

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, saltHex: string, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

/** Compares without short-circuiting on the first differing character. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
