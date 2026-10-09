import "server-only";
import { after } from "next/server";
import { getDb, type Db } from "../db/index.ts";
import { centralisConfig, cronSecret, type CentralisConfig } from "../env.ts";
import { createCentralisClient } from "./client.ts";
import { centralisLog } from "./log.ts";
import { flushOutbox } from "./outbox.ts";
import { verifyRequest } from "./signature.ts";
import { continueInitialSync } from "./user-sync.ts";
import { expireLapsedPlans } from "../access/entitlements.ts";
import { processRenewalCancellations } from "../payments/checkout.ts";
import { providerById } from "../payments/registry.ts";

/**
 * Scheduled upkeep that must not depend on anyone opening the app: monthly plans that ran
 * out are mirrored to the user record (access itself already ended by date), and renewals
 * still to be cancelled after an upgrade are retried.
 */
async function billingUpkeep() {
  const db = await getDb();
  const expired = await expireLapsedPlans(db, centralisConfig());
  const cancellations = await processRenewalCancellations(db, providerById);
  return { expired, cancellations };
}

/** How often upkeep (plan expiry, renewal cancellations, initial sync) may run from page traffic. */
const UPKEEP_EVERY_MINUTES = 10;

/**
 * Runs upkeep only if nobody ran it in the last UPKEEP_EVERY_MINUTES and nobody is running it
 * now. Never waits for a lock: a busy or recent run means "skip" (it is never urgent — access
 * itself is computed from dates on every request).
 */
export async function upkeepIfDue(db: Db, config: CentralisConfig): Promise<boolean> {
  const due = await db.tx(async (tx) => {
    const [{ locked }] = await tx.query<{ locked: boolean }>(`select pg_try_advisory_xact_lock(hashtext('lastro:upkeep')) as locked`);
    if (!locked) return false;
    const [last] = await tx.query<{ value: unknown }>(`select value from lastro.integration_state where key = 'last_upkeep_at'`);
    const at = typeof last?.value === "string" ? Date.parse(last.value) : NaN;
    if (Number.isFinite(at) && at > Date.now() - UPKEEP_EVERY_MINUTES * 60_000) return false;
    await tx.query(
      `insert into lastro.integration_state (key, value, updated_at) values ('last_upkeep_at', to_jsonb(now()), now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
    return true;
  });
  if (!due) return false;
  await billingUpkeep().catch(() => centralisLog("warn", "billing upkeep failed"));
  if (config.enabled) await continueInitialSync(db, config).catch(() => centralisLog("warn", "initial sync step failed"));
  return true;
}

/** One bounded drain (scheduler / operator): billing upkeep, a step of the initial sync, then delivery rounds of 50 events (≤ 1,000). */
export async function drainOutbox(rounds = 20) {
  const config = centralisConfig();
  const billing = await billingUpkeep().catch(() => {
    centralisLog("warn", "billing upkeep failed");
    return null;
  });
  if (!config.enabled) return { enabled: false as const, billing };
  const db = await getDb();
  const initialSync = await continueInitialSync(db, config);
  const client = createCentralisClient(config);
  let sent = 0;
  let pendingErrors = 0;
  for (let i = 0; i < rounds; i++) {
    const r = await flushOutbox(db, config, client, 50);
    sent += r.sent;
    pendingErrors += r.retried + r.failed;
    if (r.claimed === 0 || r.sent === 0) break;
  }
  return { enabled: true as const, billing, initialSync, sent, errors: pendingErrors };
}

/**
 * After a request: deliver what is queued (claiming skips rows another worker holds, so
 * concurrent requests never wait on each other), then upkeep only if it is due. Never awaited
 * by the request, never throws into it: a slow or offline Centralis or database cannot affect
 * what the user is doing.
 */
export function scheduleDrain() {
  try {
    after(async () => {
      const config = centralisConfig();
      try {
        const db = await getDb();
        if (config.enabled) await flushOutbox(db, config, createCentralisClient(config), 50);
        await upkeepIfDue(db, config);
      } catch {
        centralisLog("warn", "background drain failed");
      }
    });
  } catch {
    /* outside a request scope — the scheduled flush picks it up */
  }
}

/** Accepts either a request signed by Centralis or the scheduler's bearer token. */
export function authorizeOperator(req: Request, path: string, body = ""): boolean {
  const cron = cronSecret();
  const auth = req.headers.get("authorization");
  if (cron && auth === `Bearer ${cron}`) return true;
  const check = verifyRequest(
    centralisConfig().webhookSecret,
    { timestamp: req.headers.get("x-centralis-timestamp"), signature: req.headers.get("x-centralis-signature") },
    req.method,
    path,
    body,
  );
  return check.ok;
}
