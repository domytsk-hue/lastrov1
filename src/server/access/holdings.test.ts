import { test } from "node:test";
import assert from "node:assert/strict";
import { holdings, type EntitlementRow } from "./entitlements.ts";

// canUsePaidProduct (every paid page) decides with holdings() alone; getAccess uses the same rule.
const now = new Date("2026-10-16T12:00:00Z");
const day = 86_400_000;
const row = (over: Partial<EntitlementRow>): EntitlementRow => ({ plan_id: "mensal", source: "purchase", starts_at: new Date(+now - day), ends_at: new Date(+now + day), ...over });

test("holdings: which entitlements open the paid product now", () => {
  assert.equal(holdings([], now).active, false);
  assert.equal(holdings([row({})], now).active, true);
  assert.equal(holdings([row({ ends_at: new Date(+now - 1) })], now).active, false, "monthly time that ended");
  assert.equal(holdings([row({ starts_at: new Date(+now + day), ends_at: new Date(+now + 2 * day) })], now).active, false, "paid in advance, not started");
  assert.equal(holdings([row({ plan_id: "vitalicio", ends_at: null })], now).active, true);
  assert.equal(holdings([row({ plan_id: "vitalicio" })], now).active, false, "a lifetime row with an end is not lifetime");
  assert.equal(holdings([row({ plan_id: null, source: "admin", ends_at: null })], now).active, true);
  // Values as the database driver may return them (strings).
  assert.equal(holdings([{ plan_id: "mensal", source: "purchase", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" } as unknown as EntitlementRow], now).active, true);
});
