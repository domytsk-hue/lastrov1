/**
 * Lastro colors for TypeScript (SVG strokes, inline styles, charts).
 * These are references to the CSS tokens in tokens.css — not copies — so there is still one
 * source of truth. Change a color in tokens.css and every consumer follows.
 */
export const color = {
  ice: "var(--color-ice)",
  sky: "var(--color-sky)",
  blueSoft: "var(--color-blue-soft)",
  electric: "var(--color-electric)",
  deep: "var(--color-deep)",
  midnight: "var(--color-midnight)",
  navy: "var(--color-navy)",
  snow: "var(--color-snow)",
  env: "var(--color-env)",
  ink900: "var(--color-ink-900)",
  ink700: "var(--color-ink-700)",
  ink500: "var(--color-ink-500)",
  ink400: "var(--color-ink-400)",
  mint: "var(--color-mint)",
  mintInk: "var(--color-mint-ink)",
  amber: "var(--color-amber)",
  amberInk: "var(--color-amber-ink)",
  rose: "var(--color-rose)",
  roseInk: "var(--color-rose-ink)",
  violet: "var(--color-violet)",
} as const;

export type LastroColor = keyof typeof color;
