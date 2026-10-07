import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { action, freshDb, newUser, outbox, promote, testConfig, PRODUCT_ID } from "../test-helpers.ts";
import { handleCentralisAction } from "./actions.ts";
import { createCentralisClient, type CentralisClient } from "./client.ts";
import { backoffSeconds, enqueue, flushOutbox, MAX_ATTEMPTS, outboxHealth } from "./outbox.ts";
import { findForbiddenKeys, serializeUserForCentralis } from "./serialize.ts";
import { signRequest, verifyRequest } from "./signature.ts";
import { continueInitialSync } from "./user-sync.ts";
import { myAffiliate } from "../affiliates/me.ts";

const SECRET = "s3cr3t-for-tests";
const acceptAll = (events: { event_id: string }[]) => ({ ok: true as const, outcomes: Object.fromEntries(events.map((e) => [e.event_id, { status: "sent" as const }])) });

/* -------------------------------- allowlist & privacy -------------------------------- */

test("serializer sends only allowlisted fields, whatever the row contains", () => {
  const row = {
    id: "u_1", name: "João", email: "joao@ex.com", phone: "+5511987654321", status: "active", plan_id: "vitalicio", plan_name: "Vitalício",
    subscription_status: null, created_at: new Date("2026-01-01T00:00:00Z"), updated_at: new Date("2026-01-02T00:00:00Z"),
    // things that must never leave:
    cpf: "123.456.789-09", password_hash: "abc", password_salt: "def", password_iterations: 210000, session_token: "tok", referred_by_affiliate_id: "x",
  };
  const out = serializeUserForCentralis(row);
  assert.deepEqual(Object.keys(out).sort(), [
    "account_status", "created_at", "email", "external_user_id", "name", "phone", "plan_id", "plan_name", "subscription_status", "updated_at",
  ]);
  assert.equal(out.created_at, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(findForbiddenKeys(out), []);
});

test("forbidden-key scan catches nested secrets", () => {
  const bad = { user: { name: "x", cpf: "1" }, items: [{ card_number: "4111" }, { cvv: "123" }], auth: { access_token: "t", refresh_token: "r", password: "p" } };
  const found = findForbiddenKeys(bad);
  for (const k of ["cpf", "card_number", "cvv", "access_token", "refresh_token", "password"]) assert.ok(found.some((f) => f.endsWith(`.${k}`)), k);
});

test("enqueue refuses a payload with forbidden keys", async () => {
  const db = await freshDb();
  await assert.rejects(enqueue(db, testConfig(), "user.updated", { user: { cpf: "123" } }), /forbidden keys/);
  assert.equal((await outbox(db)).length, 0);
});

/* ------------------------------------- signatures ------------------------------------- */

test("HMAC: valid, tampered, stale and missing signatures", () => {
  const now = 1_800_000_000;
  const body = '{"a":1}';
  const sig = signRequest(SECRET, now, "POST", "/api/integrations/centralis/actions", body);
  const h = (signature: string | null, timestamp: string | null = String(now)) => ({ timestamp, signature });
  assert.deepEqual(verifyRequest(SECRET, h(sig), "POST", "/api/integrations/centralis/actions", body, now), { ok: true });
  assert.equal(verifyRequest(SECRET, h(sig), "POST", "/api/integrations/centralis/actions", '{"a":2}', now).ok, false);
  assert.equal(verifyRequest(SECRET, h(sig), "POST", "/api/other", body, now).ok, false);
  assert.equal(verifyRequest("other-secret", h(sig), "POST", "/api/integrations/centralis/actions", body, now).ok, false);
  const stale = verifyRequest(SECRET, h(sig), "POST", "/api/integrations/centralis/actions", body, now + 301);
  assert.deepEqual(stale, { ok: false, code: "stale_timestamp" });
  assert.deepEqual(verifyRequest(SECRET, h(null), "POST", "/x", body, now), { ok: false, code: "missing_signature" });
  assert.deepEqual(verifyRequest("", h(sig), "POST", "/x", body, now), { ok: false, code: "not_configured" });
});

/* --------------------------------------- client --------------------------------------- */

test("client posts the Centralis v1 format with the integration key and reads per-event results", async () => {
  const config = testConfig();
  let seen: { url: string; init: RequestInit } | null = null;
  const reply: typeof fetch = async (url, init) => {
    seen = { url: String(url), init: init! };
    const ids = (JSON.parse(String(init!.body)).events as { event_id: string }[]).map((e) => e.event_id);
    return Response.json({
      accepted: 1, duplicates: 1, rejected: 1, failed: 1,
      results: [
        { index: 0, event_id: ids[0], status: "accepted" },
        { index: 1, event_id: ids[1], status: "duplicate" },
        { index: 2, event_id: ids[2], status: "rejected", errors: [{ path: "data.amount", message: "Required" }] },
        { index: 3, event_id: ids[3], status: "failed", error: "internal" },
      ],
    });
  };
  const env = (id: string) => ({ schema_version: "1.0", event_id: id, event: "login" as const, timestamp: "2026-10-07T12:00:00.000Z", product_id: PRODUCT_ID, user: { external_user_id: "u_1" } });
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const res = await createCentralisClient(config, reply).sendEvents(ids.map(env));
  assert.ok(res.ok);
  assert.deepEqual(res.outcomes[ids[0]], { status: "sent" });
  assert.deepEqual(res.outcomes[ids[1]], { status: "sent" });
  assert.deepEqual(res.outcomes[ids[2]], { status: "rejected", error: "data.amount: Required" });
  assert.deepEqual(res.outcomes[ids[3]], { status: "retry", error: "internal" });

  const s = seen as unknown as { url: string; init: RequestInit };
  assert.equal(s.url, "https://centralis.test/api/v1/events");
  assert.equal((s.init.headers as Record<string, string>).authorization, "Bearer test-api-key-not-real");
  const sentEvent = JSON.parse(String(s.init.body)).events[0];
  assert.deepEqual(sentEvent, { event_id: ids[0], type: "login", occurred_at: "2026-10-07T12:00:00.000Z", user: { id: "u_1" } });

  const status = (n: number): typeof fetch => async () => new Response("{}", { status: n });
  const err = async (n: number) => ((await createCentralisClient(config, status(n)).sendEvents([env(randomUUID())])) as { ok: false; error: { code: string; retryable: boolean } }).error;
  assert.deepEqual([(await err(401)).code, (await err(401)).retryable], ["unauthorized", true]);
  assert.deepEqual([(await err(429)).code, (await err(429)).retryable], ["rate_limited", true]);
  assert.equal((await err(503)).retryable, true);
  assert.deepEqual([(await err(400)).code, (await err(400)).retryable], ["rejected", false]);
  const down: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(((await createCentralisClient(config, down).sendEvents([])) as { error: { code: string } }).error.code, "network");
  assert.equal(((await createCentralisClient(testConfig({ apiKey: "" }), down).sendEvents([])) as { error: { code: string } }).error.code, "not_configured");
});

/* ---------------------------------- outbox & retry ---------------------------------- */

test("backoff grows and is capped", () => {
  assert.equal(backoffSeconds(1, 0), 30);
  assert.equal(backoffSeconds(2, 0), 120);
  assert.equal(backoffSeconds(3, 0), 480);
  assert.equal(backoffSeconds(20, 0), 6 * 3600);
});

test("outbox: offline Centralis keeps events pending with backoff, then delivers them", async () => {
  const db = await freshDb();
  const config = testConfig();
  await newUser(db, config);
  const offline: CentralisClient = { sendEvents: async () => ({ ok: false, error: { code: "network", retryable: true, message: "down" } }) };
  const r1 = await flushOutbox(db, config, offline);
  assert.equal(r1.retried, r1.claimed);
  const [ev] = await outbox(db, "user.created");
  assert.equal(ev.status, "pending");
  assert.equal(ev.attempts, 1);
  // not due yet → a second flush right away claims nothing
  assert.equal((await flushOutbox(db, config, offline)).claimed, 0);

  await db.query(`update lastro.centralis_outbox set next_retry_at = now()`);
  const sent: object[] = [];
  const online: CentralisClient = { sendEvents: async (events) => (sent.push(...events), acceptAll(events)) };
  const r2 = await flushOutbox(db, config, online);
  assert.equal(r2.sent, r2.claimed);
  assert.ok(sent.length >= 2); // user.created + signup
  assert.equal((await outbox(db, "user.created"))[0].status, "sent");
  const health = await outboxHealth(db);
  assert.equal(health.pending, 0);
  assert.ok(health.last_success_at);
});

test("outbox: a rejected payload fails immediately; retryable errors fail after MAX_ATTEMPTS", async () => {
  const db = await freshDb();
  const config = testConfig();
  await enqueue(db, config, "user.updated", { user: { external_user_id: "u_x" } });
  const reject: CentralisClient = { sendEvents: async () => ({ ok: false, error: { code: "rejected", retryable: false, status: 422, message: "x" } }) };
  await flushOutbox(db, config, reject);
  assert.equal((await outbox(db))[0].status, "failed");

  await enqueue(db, config, "user.updated", { user: { external_user_id: "u_y" } });
  const flaky: CentralisClient = { sendEvents: async () => ({ ok: false, error: { code: "timeout", retryable: true, message: "x" } }) };
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await db.query(`update lastro.centralis_outbox set next_retry_at = now() where status = 'pending'`);
    await flushOutbox(db, config, flaky);
  }
  assert.deepEqual((await outbox(db)).map((e) => e.status), ["failed", "failed"]);
});

test("outbox: per-event results — accepted are sent, rejected fail, failed retry", async () => {
  const db = await freshDb();
  const config = testConfig();
  const a = await enqueue(db, config, "user.updated", { user: { external_user_id: "u_a" } });
  const b = await enqueue(db, config, "user.updated", { user: { external_user_id: "u_b" } });
  const c = await enqueue(db, config, "user.updated", { user: { external_user_id: "u_c" } });
  const mixed: CentralisClient = {
    sendEvents: async () => ({ ok: true, outcomes: { [a!]: { status: "sent" }, [b!]: { status: "rejected", error: "user.email: invalid" }, [c!]: { status: "retry", error: "internal" } } }),
  };
  const r = await flushOutbox(db, config, mixed);
  assert.deepEqual([r.sent, r.failed, r.retried], [1, 1, 1]);
  const rows = await db.query<{ event_id: string; status: string; last_error: string | null }>(`select event_id, status, last_error from lastro.centralis_outbox`);
  const by = Object.fromEntries(rows.map((x) => [x.event_id, x]));
  assert.equal(by[a!].status, "sent");
  assert.equal(by[b!].status, "failed");
  assert.match(by[b!].last_error ?? "", /user.email: invalid/);
  assert.equal(by[c!].status, "pending");
});

test("feature flag off: nothing is delivered, analytics aren't recorded, critical events are kept", async () => {
  const db = await freshDb();
  const config = testConfig({ enabled: false });
  await newUser(db, config);
  await enqueue(db, config, "page_view", { page: "/" });
  const types = (await outbox(db)).map((e) => e.event);
  assert.ok(types.includes("user.created"));
  assert.ok(!types.includes("page_view"));
  const never: CentralisClient = { sendEvents: async () => assert.fail("must not send while disabled") };
  assert.deepEqual(await flushOutbox(db, config, never), { claimed: 0, sent: 0, retried: 0, failed: 0 });
});

test("initial sync queues existing users in batches and remembers progress", async () => {
  const db = await freshDb();
  const off = testConfig({ enabled: false });
  for (let i = 0; i < 5; i++) await newUser(db, off, `Pessoa ${String.fromCharCode(65 + i)}`);
  const config = testConfig();
  assert.equal(await continueInitialSync(db, config, 2), "progressing");
  assert.equal(await continueInitialSync(db, config, 2), "progressing");
  assert.equal(await continueInitialSync(db, config, 2), "done");
  assert.equal(await continueInitialSync(db, config, 2), "done");
  const synced = (await outbox(db, "user.updated")).filter((e) => e.payload.reason === "initial_sync");
  assert.equal(synced.length, 5);
  assert.equal(new Set(synced.map((e) => (e.payload.user as { external_user_id: string }).external_user_id)).size, 5);
});

/* ------------------------------ commands from Centralis ------------------------------ */

test("normal user has no affiliate area", async () => {
  const db = await freshDb();
  const userId = await newUser(db, testConfig());
  assert.equal(await myAffiliate(db, userId, "https://lastro.app"), null);
});

test("affiliate.promote: same user gets a profile, no second account, idempotent by action_id", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config);
  const usersBefore = (await db.query(`select id from lastro.users`)).length;

  const body = action(config, "affiliate.promote", {
    external_user_id: userId,
    affiliate: { centralis_affiliate_id: randomUUID(), code: "joao", commission_rate: 0.2, attribution_window_days: 30, status: "active" },
  });
  const raw = JSON.stringify(body);
  const first = await handleCentralisAction(db, config, raw);
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);
  assert.equal(first.body.action_id, body.action_id);
  assert.equal(first.body.result?.code, "JOAO");
  assert.equal(first.body.result?.external_user_id, userId);

  const again = await handleCentralisAction(db, config, raw);
  assert.equal(again.status, 200);
  assert.equal(again.body.idempotent, true);
  assert.equal((await db.query(`select id from lastro.affiliates`)).length, 1);
  assert.equal((await db.query(`select id from lastro.users`)).length, usersBefore);

  const tampered = await handleCentralisAction(db, config, JSON.stringify({ ...body, affiliate: { ...(body.affiliate as object), code: "OTHER" } }));
  assert.equal(tampered.status, 409);
  assert.equal(tampered.body.error?.code, "action_id_reused");

  const me = await myAffiliate(db, userId, "https://lastro.app");
  assert.equal(me?.link, "https://lastro.app/?ref=JOAO");
  assert.equal(me?.short_link, "https://lastro.app/r/JOAO");
  assert.equal(me?.stats.visits, 0);
  assert.equal(me?.stats.purchases, 0);
  assert.equal((await outbox(db, "affiliate.promoted")).length, 1);

  const audit = await db.query<{ action: string; status: string }>(`select action, status from lastro.centralis_actions`);
  assert.deepEqual(audit, [{ action: "affiliate.promote", status: "applied" }]);
});

test("commands are validated: wrong product, bad schema, unknown user, invalid fields, taken code", async () => {
  const db = await freshDb();
  const config = testConfig();
  const a = await newUser(db, config, "Ana");
  const b = await newUser(db, config, "Bia");
  const run = (body: object) => handleCentralisAction(db, config, JSON.stringify(body));

  assert.equal((await run({ ...action(config, "affiliate.promote", {}), product_id: randomUUID() })).body.error?.code, "wrong_product");
  assert.equal((await run({ ...action(config, "affiliate.promote", {}), schema_version: "2.0" })).body.error?.code, "unsupported_schema_version");
  assert.equal((await run({ ...action(config, "affiliate.promote", {}), action_id: "not-a-uuid" })).body.error?.code, "invalid_action_id");
  assert.equal((await run(action(config, "users.delete_all", {}))).body.error?.code, "unknown_action");
  assert.equal((await promote(db, config, "u_does_not_exist")).body.error?.code, "user_not_found");
  assert.equal((await promote(db, config, a, "JOAO", { commission_rate: 1.5 })).body.error?.code, "invalid_commission_rate");
  assert.equal((await promote(db, config, a, "no spaces!")).body.error?.code, "invalid_code");
  assert.equal((await promote(db, config, a, "ANA")).status, 200);
  assert.equal((await promote(db, config, b, "ana")).body.error?.code, "code_taken");
  assert.equal((await handleCentralisAction(db, config, "{not json")).body.error?.code, "invalid_json");
});

test("suspend keeps history and hides the area; activate brings it back; update changes code", async () => {
  const db = await freshDb();
  const config = testConfig();
  const userId = await newUser(db, config);
  const promoted = await promote(db, config, userId, "JOAO");
  const centralisId = promoted.body.result?.centralis_affiliate_id as string;
  const run = (name: string, extra: object = {}) => handleCentralisAction(db, config, JSON.stringify(action(config, name, { external_user_id: userId, affiliate: { centralis_affiliate_id: centralisId, ...extra } })));

  assert.equal((await run("affiliate.suspend")).body.result?.status, "suspended");
  assert.equal(await myAffiliate(db, userId, "https://x"), null);
  assert.equal((await db.query(`select id from lastro.affiliates`)).length, 1);
  assert.equal((await run("affiliate.activate")).body.result?.status, "active");
  assert.equal((await run("affiliate.update", { code: "JOAO10", attribution_window_days: 45 })).body.result?.code, "JOAO10");
  assert.equal((await myAffiliate(db, userId, "https://x"))?.attribution_window_days, 45);
  assert.deepEqual((await outbox(db)).filter((e) => e.event.startsWith("affiliate.")).map((e) => e.event), ["affiliate.promoted", "affiliate.suspended", "affiliate.activated", "affiliate.updated"]);
});
