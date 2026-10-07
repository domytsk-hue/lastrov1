import "server-only";
import { after } from "next/server";
import { getDb } from "../db/index.ts";
import { centralisConfig, cronSecret } from "../env.ts";
import { createCentralisClient } from "./client.ts";
import { centralisLog } from "./log.ts";
import { flushOutbox } from "./outbox.ts";
import { verifyRequest } from "./signature.ts";
import { continueInitialSync } from "./user-sync.ts";

/** One bounded drain: a step of the initial sync, then delivery rounds of 50 events (≤ 1,000). */
export async function drainOutbox(rounds = 20) {
  const config = centralisConfig();
  if (!config.enabled) return { enabled: false as const };
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
  return { enabled: true as const, initialSync, sent, errors: pendingErrors };
}

/**
 * Delivers queued events after the response is sent. Never awaited by the request, never
 * throws into it: a slow or offline Centralis cannot affect what the user is doing.
 */
export function scheduleDrain() {
  if (!centralisConfig().enabled) return;
  try {
    after(async () => {
      try {
        await drainOutbox(1);
      } catch {
        centralisLog("warn", "background drain failed");
      }
    });
  } catch {
    /* outside a request scope — the cron flush will pick it up */
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
