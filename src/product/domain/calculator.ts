/**
 * Lastro's built-in calculator.
 *
 * Accepts Brazilian and international notation:
 *   "125 + 32,50 + 18"   → 175.5
 *   "1.250,00 - 10%"     → 1125      (percent is relative to the left operand)
 *   "200 / 4"            → 50        (and flagged as a possible installment split)
 *   "3x45" / "3 × 45"    → 135
 *
 * Implemented as a small recursive-descent parser — never `eval`.
 */

export interface CalcResult {
  value: number;
  /** True when the input contained at least one operator. */
  isExpression: boolean;
  /** Present when the expression is a single "total / n" division, n integer 2..48. */
  installments?: { total: number; count: number; each: number };
}

type Token = { t: "num"; v: number } | { t: "op"; v: "+" | "-" | "*" | "/" } | { t: "pct" } | { t: "(" } | { t: ")" };

/** Converts a pt-BR or en-US number literal into a JS number. */
export function parseLocaleNumber(raw: string): number {
  let s = raw.trim();
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const dots = (s.match(/\./g) ?? []).length;
  if (hasComma) {
    // pt-BR: dots are thousand separators, comma is decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
    // "1.250" or "1.250.000" → thousands.
    s = s.replace(/\./g, "");
  }
  return Number(s);
}

function tokenize(input: string): Token[] | null {
  const src = input
    .replace(/R\$\s?/gi, "")
    .replace(/[×xX*]/g, "*")
    .replace(/[÷:]/g, "/")
    .replace(/[−–—]/g, "-");
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[\d.,]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.,]/.test(src[j])) j++;
      const v = parseLocaleNumber(src.slice(i, j));
      if (Number.isNaN(v)) return null;
      tokens.push({ t: "num", v });
      i = j;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ t: "op", v: ch as "+" | "-" | "*" | "/" });
      i++;
      continue;
    }
    if (ch === "%") {
      tokens.push({ t: "pct" });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ t: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private i = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek() {
    return this.tokens[this.i];
  }

  parse(): number {
    const v = this.expr();
    if (this.i < this.tokens.length) throw new Error("trailing tokens");
    return v;
  }

  // expr := term (('+'|'-') term ['%'])*
  private expr(): number {
    let left = this.term();
    for (;;) {
      const tk = this.peek();
      if (tk?.t !== "op" || (tk.v !== "+" && tk.v !== "-")) return left;
      this.i++;
      let right = this.term();
      // "a + b%" means a + (a * b / 100) — the calculator convention.
      if (this.peek()?.t === "pct") {
        this.i++;
        right = (left * right) / 100;
      }
      left = tk.v === "+" ? left + right : left - right;
    }
  }

  // term := factor (('*'|'/') factor)*
  private term(): number {
    let left = this.factor();
    for (;;) {
      const tk = this.peek();
      if (tk?.t !== "op" || (tk.v !== "*" && tk.v !== "/")) return left;
      this.i++;
      let right = this.factor();
      if (this.peek()?.t === "pct" && this.tokens[this.i + 1]?.t !== "op") {
        // "200 * 10%" → 20
        this.i++;
        right = right / 100;
      }
      if (tk.v === "/" && right === 0) throw new Error("division by zero");
      left = tk.v === "*" ? left * right : left / right;
    }
  }

  // factor := '-' factor | num | '(' expr ')' ; a trailing standalone % divides by 100
  private factor(): number {
    const tk = this.peek();
    if (!tk) throw new Error("unexpected end");
    if (tk.t === "op" && tk.v === "-") {
      this.i++;
      return -this.factor();
    }
    if (tk.t === "num") {
      this.i++;
      // Lone percentage, e.g. "15%" → 0.15, unless it modifies a +/- (handled in expr).
      if (this.peek()?.t === "pct" && this.isStandalonePercent()) {
        this.i++;
        return tk.v / 100;
      }
      return tk.v;
    }
    if (tk.t === "(") {
      this.i++;
      const v = this.expr();
      if (this.peek()?.t !== ")") throw new Error("missing )");
      this.i++;
      return v;
    }
    throw new Error("unexpected token");
  }

  /** A percent is standalone when it is the whole expression. */
  private isStandalonePercent() {
    return this.i === 1 && this.tokens.length === 2;
  }
}

export function evaluate(input: string): CalcResult | null {
  const trimmed = input.trim().replace(/[+\-*/×÷x\s]+$/i, "");
  if (!trimmed) return null;
  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;
  let value: number;
  try {
    value = new Parser(tokens).parse();
  } catch {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  value = Math.round(value * 100) / 100;

  const isExpression = tokens.some((t) => t.t === "op" || t.t === "pct");
  const result: CalcResult = { value, isExpression };

  if (
    tokens.length === 3 &&
    tokens[0].t === "num" &&
    tokens[1].t === "op" &&
    tokens[1].v === "/" &&
    tokens[2].t === "num" &&
    Number.isInteger(tokens[2].v) &&
    tokens[2].v >= 2 &&
    tokens[2].v <= 48
  ) {
    result.installments = { total: tokens[0].v, count: tokens[2].v, each: value };
  }
  return result;
}

/** True when the string looks like a pure arithmetic expression (no words). */
export function isArithmetic(input: string) {
  return /^[\d\s.,+\-−*/×÷x%()R$]+$/i.test(input.trim()) && /\d/.test(input);
}
