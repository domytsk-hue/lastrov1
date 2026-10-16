import "server-only";
import { cache } from "react";
import { getDb } from "../db/index.ts";
import { sessionId, userForSessionToken } from "../auth/accounts.ts";
import { COOKIES, readCookie } from "../http.ts";
import { getAccess, holdings, paywallEnabled, type AccessSummary, type EntitlementRow } from "./entitlements.ts";

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
 * the server renders the locked state. Computed once per request (the layout and the page
 * share it).
 */
export const viewerAccess = cache(async (): Promise<{ userId: string; access: AccessSummary } | null> => {
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
});

/**
 * True when this request may render paid modules. Asked by every paid page, so it is ONE
 * query (session + account + entitlements) instead of the full access summary: a page change
 * inside the app waits for a single database round trip.
 */
export const canUsePaidProduct = cache(async (): Promise<boolean> => {
  if (!paywallEnabled()) return true;
  const token = await readCookie(COOKIES.session);
  // No account, no paid modules (there is no demonstration account any more).
  if (!token) return false;
  const db = await getDb();
  const rows = await db.query<EntitlementRow & { user_id: string }>(
    `select u.id as user_id, e.plan_id, e.source, e.starts_at, e.ends_at
       from lastro.sessions s
       join lastro.users u on u.id = s.user_id
       left join lastro.access_entitlements e on e.user_id = u.id and e.status = 'active'
      where s.id = $1 and s.expires_at > now() and u.status = 'active'`,
    [sessionId(token)],
  );
  if (!rows.length) return false;
  return holdings(rows.filter((r) => r.starts_at != null), new Date()).active;
});

export const NO_STORE = { "cache-control": "private, no-store" } as const;
