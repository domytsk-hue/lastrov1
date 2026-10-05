import { test } from "node:test";
import assert from "node:assert/strict";
import { formatIdentifier, hashPassword, maskIdentifierInput, parseIdentifier, randomSalt, safeEqual, validateName, validatePassword } from "./auth.ts";

test("email identifiers are normalised", () => {
  const r = parseIdentifier("  Lucas@Email.COM ");
  assert.deepEqual(r, { ok: true, value: { kind: "email", value: "lucas@email.com" } });
  assert.equal(parseIdentifier("lucas@email").ok, false);
  assert.equal(parseIdentifier("lucas.com").ok, false);
});

test("Brazilian phones in any format map to +55", () => {
  for (const raw of ["(11) 98765-4321", "11987654321", "+55 11 98765-4321", "5511987654321"]) {
    assert.deepEqual(parseIdentifier(raw), { ok: true, value: { kind: "phone", value: "+5511987654321" } }, raw);
  }
  assert.deepEqual(parseIdentifier("(21) 3456-7890"), { ok: true, value: { kind: "phone", value: "+552134567890" } });
  assert.equal(parseIdentifier("98765-4321").ok, false); // no DDD
  assert.equal(parseIdentifier("(11) 88765-4321").ok, false); // 11 digits must start with 9
  assert.equal(parseIdentifier("(05) 98765-4321").ok, false); // invalid DDD
  assert.equal(parseIdentifier("").ok, false);
});

test("phone mask while typing", () => {
  assert.equal(maskIdentifierInput("1"), "(1");
  assert.equal(maskIdentifierInput("11987"), "(11) 987");
  assert.equal(maskIdentifierInput("1198765432"), "(11) 9876-5432");
  assert.equal(maskIdentifierInput("11987654321"), "(11) 98765-4321");
  assert.equal(maskIdentifierInput("lucas@"), "lucas@");
  assert.equal(maskIdentifierInput("(12) 3a"), "123a");
  assert.equal(formatIdentifier({ kind: "phone", value: "+5511987654321" }), "(11) 98765-4321");
});

test("names and passwords", () => {
  assert.deepEqual(validateName("  Ana   Clara "), { ok: true, value: "Ana Clara" });
  assert.equal(validateName("A").ok, false);
  assert.equal(validateName("Ana2").ok, false);
  assert.equal(validatePassword("abc123").ok, false);
  assert.equal(validatePassword("abcdefgh").ok, false);
  assert.equal(validatePassword("12345678").ok, false);
  assert.equal(validatePassword("lastro2026").ok, true);
});

test("password hashing is salted and deterministic", async () => {
  const salt = randomSalt();
  const a = await hashPassword("lastro2026", salt, 1000);
  assert.equal(a, await hashPassword("lastro2026", salt, 1000));
  assert.notEqual(a, await hashPassword("lastro2027", salt, 1000));
  assert.notEqual(a, await hashPassword("lastro2026", randomSalt(), 1000));
  assert.equal(a.length, 64);
  assert.ok(safeEqual(a, a));
  assert.ok(!safeEqual(a, a.replace(/.$/, "0") === a ? a.replace(/.$/, "1") : a.replace(/.$/, "0")));
});
