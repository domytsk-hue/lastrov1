import "server-only";
import { cookies } from "next/headers";

/** Cookie names and options shared by route handlers. All httpOnly: scripts can't read them. */
export const COOKIES = {
  session: "lastro_session",
  visitor: "lastro_vid",
  visitorSession: "lastro_sid",
} as const;

const base = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

export async function readCookie(name: string): Promise<string | null> {
  return (await cookies()).get(name)?.value ?? null;
}

export async function setCookie(name: string, value: string, maxAgeSeconds: number) {
  (await cookies()).set(name, value, { ...base, maxAge: maxAgeSeconds });
}

export async function clearCookie(name: string) {
  (await cookies()).set(name, "", { ...base, maxAge: 0 });
}

/** Parses a small JSON body; anything else is treated as empty. */
export async function readJson(req: Request, max = 16 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text || text.length > max) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
