import type { Db } from "../db/index.ts";

/**
 * Last-click attribution. Each valid affiliate click writes an attribution with an expiry
 * (click time + the affiliate's window, 30 days by default). The newest unexpired one wins.
 * A visitor who signs up carries their attributions over to the user, so a purchase made
 * later — from any device, signed in — still finds it.
 */

export interface ActiveAttribution {
  affiliate_id: string;
  code: string;
  centralis_affiliate_id: string;
  click_id: string;
  attributed_at: Date;
}

export async function latestValidAttribution(db: Db, who: { visitorId?: string | null; userId?: string | null }, at: Date = new Date()): Promise<ActiveAttribution | null> {
  if (!who.visitorId && !who.userId) return null;
  const [a] = await db.query<ActiveAttribution>(
    `select a.affiliate_id, f.code, f.centralis_affiliate_id, a.click_id, a.attributed_at
       from lastro.attributions a join lastro.affiliates f on f.id = a.affiliate_id
      where (a.visitor_id = $1::uuid or a.user_id = $2::text)
        and a.attributed_at <= $3 and a.expires_at > $3
      order by a.attributed_at desc
      limit 1`,
    [who.visitorId ?? null, who.userId ?? null, at],
  );
  return a ?? null;
}

/** Links an anonymous visitor to the account they signed up / logged in with. */
export async function linkVisitorToUser(db: Db, visitorId: string | null, userId: string) {
  if (!visitorId) return;
  await db.query(`update lastro.visitors set user_id = $2, last_seen_at = now() where id = $1 and (user_id is null or user_id = $2)`, [visitorId, userId]);
  await db.query(`update lastro.attributions set user_id = $2 where visitor_id = $1 and user_id is null`, [visitorId, userId]);
}
