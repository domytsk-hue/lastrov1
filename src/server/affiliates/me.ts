import type { Db } from "../db/index.ts";
import { affiliateLink, affiliateStats, findAffiliateByUser, type AffiliateStats } from "./service.ts";

/**
 * The signed-in user's own affiliate view. The affiliate is always resolved from the session's
 * user id — never from an id sent by the browser — so A can't read B. Anything but an active
 * profile reads as "not an affiliate": the UI then shows nothing at all.
 */
export interface MyAffiliate {
  code: string;
  link: string;
  short_link: string;
  attribution_window_days: number;
  stats: AffiliateStats;
}

export async function myAffiliate(db: Db, userId: string, baseUrl: string): Promise<MyAffiliate | null> {
  const a = await findAffiliateByUser(db, userId);
  if (!a || a.status !== "active") return null;
  const links = affiliateLink(baseUrl, a.code);
  return { code: a.code, link: links.query, short_link: links.short, attribution_window_days: a.attribution_window_days, stats: await affiliateStats(db, a.id) };
}
