/** The affiliate-landing cookie set by the middleware: "CODE.epochMs". Pure, for tests. */
/** "CODE.1712345678901" → { code, at } */
export function parseRefCookie(raw: string | null | undefined, now = Date.now()): { code: string; at: Date } | null {
  const m = /^([A-Z0-9_-]{2,32})\.(\d{13})$/.exec(raw ?? "");
  if (!m) return null;
  const at = Number(m[2]);
  if (at > now + 60_000) return null; // from the future: not a real landing
  return { code: m[1], at: new Date(at) };
}
