/**
 * Shared fixtures for server tests: a fresh embedded Postgres with the real migrations,
 * a Centralis config, and small helpers that walk the same code paths the routes use.
 */
import { randomUUID } from "node:crypto";
import { createPgliteDb, type Db } from "./db/index.ts";
import type { CentralisConfig } from "./env.ts";
import { handleCentralisAction } from "./centralis/actions.ts";
import { signUp } from "./auth/accounts.ts";
import { ensureSession, ensureVisitor, recordAffiliateClick } from "./tracking/service.ts";
import { handlePaymentEvent } from "./payments/orders.ts";
import { createOrder } from "./payments/checkout.ts";

export const PRODUCT_ID = "7f1c9c1e-5a0b-4d7e-9b7a-6a1f3e2d4c5b";

export function testConfig(over: Partial<CentralisConfig> = {}): CentralisConfig {
  return {
    enabled: true,
    apiUrl: "https://centralis.test",
    productId: PRODUCT_ID,
    apiKey: "test-api-key-not-real",
    webhookSecret: "test-webhook-secret-not-real",
    schemaVersion: "1.0",
    timeoutMs: 2000,
    ...over,
  };
}

export const freshDb = () => createPgliteDb();

/** A unique valid mobile number for tests: (11) 9XXXX-XXXX. */
export const testPhone = () => `119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

export async function newUser(db: Db, config: CentralisConfig, name = "João Silva", email = `${randomUUID().slice(0, 8)}@exemplo.com`, visitorId: string | null = null, phone = testPhone()) {
  const r = await signUp(db, config, { name, email, phone, password: "senhaForte123" }, { visitorId });
  if (!r.ok) throw new Error(r.error);
  return r.value.session.userId;
}

export function action(config: CentralisConfig, action: string, body: Record<string, unknown>, actionId: string = randomUUID()): Record<string, unknown> {
  return { schema_version: "1.0", action_id: actionId, action, product_id: config.productId, ...body };
}

export async function promote(db: Db, config: CentralisConfig, userId: string, code = "JOAO", extra: Record<string, unknown> = {}) {
  const body = action(config, "affiliate.promote", {
    external_user_id: userId,
    affiliate: { centralis_affiliate_id: randomUUID(), code, commission_rate: 0.2, attribution_window_days: 30, status: "active", ...extra },
  });
  return handleCentralisAction(db, config, JSON.stringify(body));
}

/** A browser: visitor + session, like /api/track creates them. */
export async function browser(db: Db, config: CentralisConfig) {
  const { visitorId } = await ensureVisitor(db, null);
  const { sessionId } = await ensureSession(db, config, visitorId, null);
  return { visitorId, sessionId };
}

export function landWithRef(db: Db, config: CentralisConfig, b: { visitorId: string; sessionId: string }, code: string, at?: Date) {
  return recordAffiliateClick(db, config, b.visitorId, b.sessionId, { code, landingPage: "/", referrer: "https://instagram.com/", utm: { source: "instagram" } }, at);
}

/** A gateway as far as order creation cares: its id and the methods it offers. */
export const SANDBOX = { id: "sandbox", methods: ["pix", "card"] as ("pix" | "card")[] };

/** Opens (or reuses) the pending order for a plan, as POST /api/checkout does. */
export async function openOrder(db: Db, config: CentralisConfig, userId: string, plan = "vitalicio", opts: { visitorId?: string | null; method?: string; key?: string; at?: Date } = {}) {
  const r = await createOrder(db, config, { userId, planId: plan, method: opts.method ?? "pix", idempotencyKey: opts.key ?? `key_${randomUUID()}`, visitorId: opts.visitorId ?? null, provider: SANDBOX }, opts.at);
  if (!r.ok) throw new Error(r.error);
  return { orderId: r.order.id, plan: r.plan, reused: r.reused };
}

/** Checkout + gateway confirmation through the sandbox event shape. */
export async function buy(db: Db, config: CentralisConfig, userId: string, opts: { plan?: string; visitorId?: string | null; at?: Date; tx?: string } = {}) {
  const started = await openOrder(db, config, userId, opts.plan ?? "vitalicio", { visitorId: opts.visitorId, at: opts.at });
  const tx = opts.tx ?? `txn_${randomUUID()}`;
  const result = await handlePaymentEvent(db, config, "sandbox", {
    providerEventId: `evt_${randomUUID()}`,
    type: "payment.approved",
    orderId: started.orderId,
    transactionId: tx,
    providerSubscriptionId: opts.plan === "mensal" ? `sub_${randomUUID()}` : undefined,
    amountMinor: started.plan.amount_minor,
    currency: started.plan.currency,
    occurredAt: opts.at ?? new Date(),
  });
  return { orderId: started.orderId, transactionId: tx, result };
}

export interface OutboxEvent {
  event: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
}

export async function outbox(db: Db, type?: string): Promise<OutboxEvent[]> {
  const rows = await db.query<{ event_type: string; status: string; attempts: number; payload: Record<string, unknown> }>(
    `select event_type, status, attempts, payload from lastro.centralis_outbox ${type ? "where event_type = $1" : ""} order by created_at`,
    type ? [type] : [],
  );
  return rows.map((r) => ({ event: r.event_type, status: r.status, attempts: r.attempts, payload: r.payload }));
}
