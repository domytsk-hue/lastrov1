import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import {
  AFFILIATE_STATUSES,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  findAffiliateByCentralisId,
  findAffiliateByCode,
  findAffiliateByUser,
  insertAffiliate,
  normalizeCode,
  updateAffiliate,
  upsertCommissionProjection,
  type Affiliate,
  type AffiliateFields,
  type AffiliateStatus,
} from "../affiliates/service.ts";
import { centralisLog } from "./log.ts";
import { enqueue } from "./outbox.ts";
import { sha256Hex } from "./signature.ts";
import { createUserSync, syncUsersBatch } from "./user-sync.ts";

/**
 * Commands from Centralis (CENTRALIS → LASTRO). The request was already authenticated
 * (HMAC) by the route; here every field is validated, the command is applied once per
 * action_id, recorded for audit and acknowledged.
 */

export const ACTIONS = [
  "affiliate.promote",
  "affiliate.update",
  "affiliate.suspend",
  "affiliate.activate",
  "affiliate.stats_sync",
  "resync.user",
  "resync.affiliate",
  "resync.order",
  "sync.users",
] as const;
export type ActionName = (typeof ACTIONS)[number];

export interface ActionResponse {
  success: boolean;
  action_id: string | null;
  idempotent?: boolean;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface ActionOutcome {
  status: number;
  body: ActionResponse;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class Reject extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

function readRate(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw new Reject(422, "invalid_commission_rate", "commission_rate must be a number between 0 and 1.");
  return v;
}

function readWindow(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 365) throw new Reject(422, "invalid_attribution_window", "attribution_window_days must be an integer from 1 to 365.");
  return v as number;
}

function readStatus(v: unknown): AffiliateStatus | undefined {
  if (v === undefined || v === null) return undefined;
  if (!AFFILIATE_STATUSES.includes(v as AffiliateStatus)) throw new Reject(422, "invalid_status", "status must be active, suspended or disabled.");
  return v as AffiliateStatus;
}

function readCode(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const code = normalizeCode(v);
  if (!code) throw new Reject(422, "invalid_code", "code must be 2–32 letters, digits, - or _.");
  return code;
}

const view = (a: Affiliate) => ({
  affiliate_id: a.id,
  centralis_affiliate_id: a.centralis_affiliate_id,
  external_user_id: a.user_id,
  code: a.code,
  status: a.status,
  attribution_window_days: a.attribution_window_days,
});

const affiliateEventBody = (a: Affiliate, actionId: string) => ({
  action_id: actionId,
  user: { external_user_id: a.user_id },
  affiliate: {
    centralis_affiliate_id: a.centralis_affiliate_id,
    code: a.code,
    status: a.status,
    attribution_window_days: a.attribution_window_days,
    commission_rate_reference: a.commission_rate_reference === null ? null : Number(a.commission_rate_reference),
  },
});

async function codeTakenByOther(db: Db, code: string, selfId?: string) {
  const other = await findAffiliateByCode(db, code);
  return !!other && other.id !== selfId;
}

async function targetAffiliate(db: Db, p: Record<string, unknown>): Promise<Affiliate> {
  const centralisId = str(isObj(p.affiliate) ? p.affiliate.centralis_affiliate_id : undefined) ?? str(p.centralis_affiliate_id);
  const userId = str(p.external_user_id);
  const a = centralisId ? await findAffiliateByCentralisId(db, centralisId) : userId ? await findAffiliateByUser(db, userId) : null;
  if (!a) throw new Reject(404, "affiliate_not_found", "No affiliate profile matches this command.");
  if (userId && a.user_id !== userId) throw new Reject(409, "affiliate_user_mismatch", "The affiliate belongs to a different user.");
  return a;
}

type Handler = (db: Db, config: CentralisConfig, p: Record<string, unknown>, actionId: string) => Promise<Record<string, unknown>>;

const handlers: Record<ActionName, Handler> = {
  async "affiliate.promote"(db, config, p, actionId) {
    const userId = str(p.external_user_id);
    if (!userId) throw new Reject(422, "invalid_external_user_id", "external_user_id is required.");
    if (!isObj(p.affiliate)) throw new Reject(422, "invalid_affiliate", "affiliate object is required.");
    const centralisId = str(p.affiliate.centralis_affiliate_id);
    if (!centralisId) throw new Reject(422, "invalid_centralis_affiliate_id", "affiliate.centralis_affiliate_id is required.");
    const code = readCode(p.affiliate.code);
    if (!code) throw new Reject(422, "invalid_code", "affiliate.code is required.");
    const fields: AffiliateFields = {
      code,
      commissionRate: readRate(p.affiliate.commission_rate) ?? null,
      windowDays: readWindow(p.affiliate.attribution_window_days) ?? DEFAULT_ATTRIBUTION_WINDOW_DAYS,
      status: readStatus(p.affiliate.status) ?? "active",
    };

    const [user] = await db.query<{ id: string; status: string }>(`select id, status from lastro.users where id = $1`, [userId]);
    if (!user) throw new Reject(404, "user_not_found", "No user with this external_user_id.");

    // Same user, same affiliate: promoting again updates in place — never a second profile.
    const existing = await findAffiliateByUser(db, userId);
    if (existing && existing.centralis_affiliate_id !== centralisId) {
      throw new Reject(409, "already_affiliate", "This user already has a different affiliate profile.");
    }
    if (await codeTakenByOther(db, code, existing?.id)) throw new Reject(409, "code_taken", "This affiliate code is already in use.");
    const byCentralisId = await findAffiliateByCentralisId(db, centralisId);
    if (byCentralisId && byCentralisId.user_id !== userId) throw new Reject(409, "centralis_affiliate_id_taken", "This Centralis affiliate id belongs to another user.");

    const a = existing ? await updateAffiliate(db, existing.id, fields) : await insertAffiliate(db, userId, centralisId, fields);
    await enqueue(db, config, "affiliate.promoted", affiliateEventBody(a, actionId));
    return { created: !existing, ...view(a) };
  },

  async "affiliate.update"(db, config, p, actionId) {
    const a = await targetAffiliate(db, p);
    const src = isObj(p.affiliate) ? p.affiliate : {};
    const code = readCode(src.code);
    if (code && (await codeTakenByOther(db, code, a.id))) throw new Reject(409, "code_taken", "This affiliate code is already in use.");
    const updated = await updateAffiliate(db, a.id, {
      code,
      commissionRate: readRate(src.commission_rate),
      windowDays: readWindow(src.attribution_window_days),
      status: readStatus(src.status),
    });
    await enqueue(db, config, "affiliate.updated", affiliateEventBody(updated, actionId));
    return view(updated);
  },

  async "affiliate.suspend"(db, config, p, actionId) {
    const a = await targetAffiliate(db, p);
    const updated = await updateAffiliate(db, a.id, { status: "suspended" }); // history (clicks, charges) stays
    await enqueue(db, config, "affiliate.suspended", affiliateEventBody(updated, actionId));
    return view(updated);
  },

  async "affiliate.activate"(db, config, p, actionId) {
    const a = await targetAffiliate(db, p);
    const updated = await updateAffiliate(db, a.id, { status: "active" });
    await enqueue(db, config, "affiliate.activated", affiliateEventBody(updated, actionId));
    return view(updated);
  },

  /** Centralis pushes commission figures for the affiliate's dashboard (minor units). */
  async "affiliate.stats_sync"(db, _config, p) {
    const a = await targetAffiliate(db, p);
    const s = isObj(p.stats) ? p.stats : null;
    if (!s) throw new Reject(422, "invalid_stats", "stats object is required.");
    const money = (v: unknown, k: string) => {
      if (v === undefined || v === null) return null;
      if (!Number.isInteger(v) || (v as number) < 0) throw new Reject(422, "invalid_stats", `${k} must be a non-negative integer (minor units).`);
      return v as number;
    };
    const currency = typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency) ? s.currency : "BRL";
    await upsertCommissionProjection(db, a.id, {
      generated: money(s.commission_generated_minor, "commission_generated_minor"),
      pending: money(s.pending_commission_minor, "pending_commission_minor"),
      paid: money(s.paid_commission_minor, "paid_commission_minor"),
      currency,
    });
    return { affiliate_id: a.id, synced: true };
  },

  async "resync.user"(db, config, p) {
    const userId = str(p.external_user_id);
    if (!userId) throw new Reject(422, "invalid_external_user_id", "external_user_id is required.");
    const eventId = await createUserSync(config).updated(db, userId, "resync");
    if (!eventId) throw new Reject(404, "user_not_found", "No user with this external_user_id.");
    return { queued_event_id: eventId };
  },

  async "resync.affiliate"(db, config, p, actionId) {
    const a = await targetAffiliate(db, p);
    const eventId = await enqueue(db, config, "affiliate.updated", { ...affiliateEventBody(a, actionId), reason: "resync" });
    return { queued_event_id: eventId };
  },

  /** Re-delivers the original events of an order with their original event_ids (dedup-safe). */
  async "resync.order"(db, _config, p) {
    const orderId = str(p.external_order_id);
    if (!orderId) throw new Reject(422, "invalid_external_order_id", "external_order_id is required.");
    const rows = await db.query(
      `update lastro.centralis_outbox set status = 'pending', next_retry_at = now(), attempts = 0
        where payload -> 'order' ->> 'external_order_id' = $1 and status in ('sent', 'failed') returning event_id`,
      [orderId],
    );
    return { requeued_events: rows.length };
  },

  async "sync.users"(db, config, p) {
    const limit = Number.isInteger(p.limit) && (p.limit as number) > 0 && (p.limit as number) <= 1000 ? (p.limit as number) : 200;
    const cursor = str(p.cursor);
    const { queued, next } = await syncUsersBatch(db, config, cursor, limit);
    return { queued, next_cursor: next };
  },
};

/**
 * Validates, deduplicates (action_id) and applies one command. `rawBody` is the exact
 * signed string, used for the idempotency fingerprint.
 */
export async function handleCentralisAction(db: Db, config: CentralisConfig, rawBody: string): Promise<ActionOutcome> {
  let p: unknown;
  try {
    p = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { success: false, action_id: null, error: { code: "invalid_json", message: "Body must be JSON." } } };
  }
  if (!isObj(p)) return { status: 400, body: { success: false, action_id: null, error: { code: "invalid_payload", message: "Body must be an object." } } };

  const actionId = typeof p.action_id === "string" && UUID_RE.test(p.action_id) ? p.action_id.toLowerCase() : null;
  const fail = (status: number, code: string, message: string): ActionOutcome => ({ status, body: { success: false, action_id: actionId, error: { code, message } } });

  if (!actionId) return fail(422, "invalid_action_id", "action_id must be a UUID.");
  if (typeof p.schema_version !== "string" || p.schema_version.split(".")[0] !== config.schemaVersion.split(".")[0]) {
    return fail(422, "unsupported_schema_version", `schema_version ${config.schemaVersion.split(".")[0]}.x is required.`);
  }
  if (p.product_id !== config.productId) return fail(403, "wrong_product", "product_id does not match this product.");
  if (!ACTIONS.includes(p.action as ActionName)) return fail(422, "unknown_action", "Unsupported action.");

  const action = p.action as ActionName;
  const fingerprint = sha256Hex(rawBody);
  const externalUserId = str(p.external_user_id);

  return db.tx(async (tx) => {
    // Lock-free idempotency: the primary key on action_id decides; a replay returns the first answer.
    const [prev] = await tx.query<{ payload_sha256: string; response: ActionResponse | string; status: string }>(
      `select payload_sha256, response, status from lastro.centralis_actions where action_id = $1`,
      [actionId],
    );
    if (prev) {
      if (prev.payload_sha256 !== fingerprint) return fail(409, "action_id_reused", "This action_id was already used with a different payload.");
      const body = (typeof prev.response === "string" ? JSON.parse(prev.response) : prev.response) as ActionResponse;
      return { status: prev.status === "applied" ? 200 : 409, body: { ...body, idempotent: true } };
    }

    let outcome: ActionOutcome;
    try {
      const result = await tx.tx(async (inner) => handlers[action](inner, config, p as Record<string, unknown>, actionId));
      outcome = { status: 200, body: { success: true, action_id: actionId, result } };
    } catch (e) {
      if (!(e instanceof Reject)) throw e;
      outcome = fail(e.status, e.code, e.message);
    }

    await tx.query(
      `insert into lastro.centralis_actions (action_id, action, payload_sha256, external_user_id, status, response)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [actionId, action, fingerprint, externalUserId, outcome.body.success ? "applied" : "rejected", JSON.stringify(outcome.body)],
    );
    centralisLog(outcome.body.success ? "info" : "warn", `action ${action}`, {
      action_id: actionId,
      external_user_id: externalUserId ?? undefined,
      status: outcome.status,
      code: outcome.body.error?.code,
    });
    return outcome;
  });
}
