import "server-only";
import { getDb } from "../db/index.ts";
import { userForSessionToken } from "../auth/accounts.ts";
import { COOKIES, readCookie } from "../http.ts";
import { getAccess, paywallEnabled, type AccessSummary } from "./entitlements.ts";

/** The signed-in user of this request (from the httpOnly session cookie), or null. */
export async function currentUser() {
  // The cookie first: it makes the page per-request, and no cookie needs no database.
  const token = await readCookie(COOKIES.session);
  const db = await getDb();
  const user = token ? await userForSessionToken(db, token) : null;
  return { db, user };
}

/**
 * The single server-side answer to "may this request use the paid product?" used by the
 * /app pages. No session cookie → `null`: the client shell sends the person to /login, or
 * the server renders the locked state.
 */
export async function viewerAccess(): Promise<{ userId: string; access: AccessSummary } | null> {
  if (!(await readCookie(COOKIES.session))) return null;
  try {
    const { db, user } = await currentUser();
    if (!user) return null;
    return { userId: user.id, access: await getAccess(db, user.id) };
  } catch (e) {
    // Database unreachable. Paywall off: the app works exactly as before (data is on the
    // device). Paywall on: fail loudly rather than show a paying user a "buy a plan" screen.
    if (!paywallEnabled()) return null;
    throw e;
  }
}

/** True when this request may render paid modules. */
export async function canUsePaidProduct(): Promise<boolean> {
  if (!paywallEnabled()) return true;
  const v = await viewerAccess();
  // No account, no paid modules (there is no demonstration account any more).
  return v ? v.access.active : false;
}

export const NO_STORE = { "cache-control": "private, no-store" } as const;
