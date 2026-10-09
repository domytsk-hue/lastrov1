import type { Envelope } from "./outbox.ts";

/**
 * Translation to the Centralis Hub ingestion contract (`POST /api/v1/events`).
 *
 * Lastro keeps its own internal event shapes in the outbox (minor units, rich order data);
 * this module maps each one, at delivery time, to the shape Centralis validates:
 *
 *   { event_id, type, occurred_at, visitor_id?, session_id?, user?, page?, utm?, data? }
 *
 * Centralis identifies the system by its API key, so `product_id` is not sent. Money goes as
 * a decimal amount in the currency's major unit (9990 minor → 99.9), as Centralis expects.
 * Unknown internal events are sent as custom types (same name; Centralis stores them).
 */

export interface CentralisV1Event {
  event_id: string;
  type: string;
  occurred_at: string;
  visitor_id?: string;
  session_id?: string;
  user?: { id: string; email?: string; name?: string; phone?: string; plan?: string; status?: "active" | "inactive" | "blocked" };
  page?: { path: string; referrer?: string };
  utm?: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;
  data?: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : undefined);

/** Minor units → decimal major units without float drift (9990 → 99.9, 1990 → 19.9). */
export const toMajor = (minor: unknown): number | undefined => (Number.isInteger(minor) ? Math.round(minor as number) / 100 : undefined);

/** Lastro account status → Centralis user status. */
const STATUS: Record<string, "active" | "inactive" | "blocked"> = { active: "active", suspended: "blocked", deactivated: "inactive" };

/** Drops undefined keys so optional fields are simply absent. */
function clean<T extends Obj>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** Full allowlisted user (from serializeUserForCentralis) → Centralis user. */
function fullUser(u: Obj): CentralisV1Event["user"] | undefined {
  const id = str(u.external_user_id);
  if (!id) return undefined;
  return clean({
    id,
    email: str(u.email),
    name: str(u.name),
    phone: str(u.phone),
    plan: str(u.plan_id),
    status: STATUS[String(u.account_status)] ?? undefined,
  });
}

const userRef = (u: unknown) => {
  const id = str(obj(u).external_user_id);
  return id ? { id } : undefined;
};

const affiliateCode = (a: unknown) => str(obj(a).code);

export function toCentralisV1(e: Envelope): CentralisV1Event {
  const base = clean({
    event_id: e.event_id,
    occurred_at: e.timestamp,
    visitor_id: uuid(e.visitor_id),
    session_id: uuid(e.session_id),
  }) as Omit<CentralisV1Event, "type">;

  switch (e.event) {
    case "user.created":
    case "user.updated":
    case "user.plan_changed":
    case "user.status_changed":
    case "user.subscription_changed":
    case "user.deactivated": {
      const u = obj(e.user);
      return clean({
        ...base,
        type: "user_updated",
        user: fullUser(u),
        data: clean({
          change: e.event.slice("user.".length),
          reason: str(e.reason),
          plan_name: str(u.plan_name),
          subscription_status: str(u.subscription_status),
          previous_plan_id: str(e.previous_plan_id),
          previous_status: str(e.previous_status),
          created_at: str(u.created_at),
        }),
      });
    }

    case "signup":
      return clean({ ...base, type: "signup", user: fullUser(obj(e.user)) ?? userRef(e.user), data: clean({ affiliate_code: affiliateCode(e.affiliate) }) });

    case "login":
      return clean({ ...base, type: "login", user: userRef(e.user) });

    case "page_view":
      return clean({ ...base, type: "page_view", page: { path: String(e.page ?? "/") } });

    case "session.started":
      return { ...base, type: "session_start" };

    case "affiliate.click": {
      const utm = obj(e.utm);
      const utmClean = clean({ source: str(utm.source), medium: str(utm.medium), campaign: str(utm.campaign), content: str(utm.content), term: str(utm.term) });
      return clean({
        ...base,
        type: "affiliate_click",
        page: str(e.landing_page) ? clean({ path: e.landing_page as string, referrer: str(e.referrer) }) : undefined,
        utm: Object.keys(utmClean).length ? utmClean : undefined,
        data: { code: affiliateCode(e.affiliate) },
      });
    }

    case "checkout.started": {
      const o = obj(e.order);
      return clean({
        ...base,
        type: "checkout_start",
        user: userRef(e.user),
        data: clean({ order_id: str(o.external_order_id), plan: str(o.plan_id), plan_name: str(o.plan_name), amount: toMajor(o.amount_minor), currency: str(o.currency), affiliate_code: affiliateCode(e.affiliate) }),
      });
    }

    case "purchase": {
      // Every paid charge is its own Centralis order (renewals included), keyed by charge id.
      const o = obj(e.order);
      return clean({
        ...base,
        type: "purchase",
        // The buyer's allowlisted profile (name, e-mail, phone) when known; the plan just bought.
        user: clean({ ...(fullUser(obj(e.user)) ?? { id: str(obj(e.user).external_user_id) as string }), plan: str(o.plan_id) }),
        data: clean({
          order_id: str(o.external_charge_id) ?? str(o.external_order_id),
          lastro_order_id: str(o.external_order_id),
          amount: toMajor(o.amount_minor),
          currency: str(o.currency),
          status: "paid",
          payment_method: str(o.gateway),
          affiliate_code: affiliateCode(e.affiliate),
          subscription_id: str(o.external_subscription_id),
          plan: str(o.plan_id),
          plan_name: str(o.plan_name),
          kind: str(o.kind),
        }),
      });
    }

    case "refund": {
      const r = obj(e.refund);
      const orig = obj(e.original);
      return clean({
        ...base,
        type: "refund",
        user: userRef(e.user),
        data: clean({ order_id: str(orig.external_charge_id) ?? str(orig.external_order_id), amount: toMajor(r.amount_minor), currency: str(r.currency), refund_id: str(r.external_refund_id) }),
      });
    }

    case "subscription.created": {
      const s = obj(e.subscription);
      return clean({
        ...base,
        type: "subscription_started",
        user: userRef(e.user),
        data: clean({ subscription_id: str(s.external_subscription_id), plan: str(s.plan_id), amount: toMajor(s.amount_minor), currency: str(s.currency), interval: "month", status: "active" }),
      });
    }

    case "subscription.renewed":
      return clean({ ...base, type: "subscription_renewed", user: userRef(e.user), data: { subscription_id: str(obj(e.subscription).external_subscription_id) } });

    case "subscription.updated":
    case "subscription.cancelled": {
      const s = obj(e.subscription);
      return clean({
        ...base,
        type: e.event === "subscription.cancelled" ? "subscription_cancelled" : "subscription_updated",
        user: userRef(e.user),
        data: clean({ subscription_id: str(s.external_subscription_id), status: str(s.status) }),
      });
    }

    default: {
      // affiliate.attributed, affiliate.promoted/updated/suspended/activated, payment.failed:
      // custom types, data without any personal information.
      const { schema_version, event_id, event, timestamp, product_id, user, visitor_id, session_id, ...rest } = e;
      void schema_version; void event_id; void timestamp; void product_id; void visitor_id; void session_id;
      return clean({ ...base, type: event, user: userRef(user), data: rest });
    }
  }
}
