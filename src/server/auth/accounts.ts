import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword, parseEmailAddress, parseIdentifier, parsePhoneNumber, PBKDF2_ITERATIONS, randomSalt, safeEqual, validateName, validatePassword, type Identifier, type Result } from "../../auth/rules.ts";
import type { Db } from "../db/index.ts";
import type { CentralisConfig } from "../env.ts";
import { enqueue } from "../centralis/outbox.ts";
import { createUserSync, loadCentralisUser } from "../centralis/user-sync.ts";
import { serializeUserForCentralis } from "../centralis/serialize.ts";
import { latestValidAttribution, linkVisitorToUser } from "../tracking/attribution.ts";

/**
 * Server-side accounts: same rules and same PBKDF2 parameters as the original on-device
 * accounts, now stored in Postgres. Sessions are random tokens in an httpOnly cookie; only
 * their sha256 is stored.
 */

export const SESSION_DAYS = 30;

export interface ClientSession {
  userId: string;
  name: string;
  identifier: Identifier;
  demo: false;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

const INVALID_CREDENTIALS = "E-mail, telefone ou senha incorretos.";
const sessionId = (token: string) => createHash("sha256").update(token).digest("hex");

export const toClientSession = (u: Pick<UserRow, "id" | "name" | "email" | "phone">): ClientSession => ({
  userId: u.id,
  name: u.name,
  identifier: u.email ? { kind: "email", value: u.email } : { kind: "phone", value: u.phone as string },
  demo: false,
});

async function findByIdentifier(db: Db, id: Identifier): Promise<UserRow | null> {
  const [u] = await db.query<UserRow>(`select * from lastro.users where ${id.kind === "email" ? "email" : "phone"} = $1`, [id.value]);
  return u ?? null;
}

export async function createSession(db: Db, userId: string, now = new Date()): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.query(`insert into lastro.sessions (id, user_id, expires_at) values ($1, $2, $3)`, [sessionId(token), userId, expires]);
  return { token, expires };
}

export async function userForSessionToken(db: Db, token: string | undefined | null): Promise<UserRow | null> {
  if (!token) return null;
  const [u] = await db.query<UserRow>(
    `select u.* from lastro.sessions s join lastro.users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.status = 'active'`,
    [sessionId(token)],
  );
  return u ?? null;
}

export async function deleteSession(db: Db, token: string | undefined | null) {
  if (token) await db.query(`delete from lastro.sessions where id = $1`, [sessionId(token)]);
}

export interface RequestContext {
  visitorId: string | null;
}

export async function signUp(
  db: Db,
  config: CentralisConfig,
  input: { name: unknown; email: unknown; phone: unknown; password: unknown },
  ctx: RequestContext,
): Promise<Result<{ session: ClientSession; token: string; expires: Date }>> {
  const n = validateName(String(input.name ?? ""));
  if (!n.ok) return n;
  // A new account always has both: e-mail and phone (either one signs in later).
  const email = parseEmailAddress(String(input.email ?? ""));
  if (!email.ok) return email;
  const phone = parsePhoneNumber(String(input.phone ?? ""));
  if (!phone.ok) return phone;
  const password = String(input.password ?? "");
  const pw = validatePassword(password);
  if (!pw.ok) return pw;

  const emailTaken = "Já existe uma conta com esse e-mail. Que tal entrar?";
  const phoneTaken = "Já existe uma conta com esse telefone. Que tal entrar?";
  if (await findByIdentifier(db, { kind: "email", value: email.value })) return { ok: false, error: emailTaken };
  if (await findByIdentifier(db, { kind: "phone", value: phone.value })) return { ok: false, error: phoneTaken };

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const userId = `u_${randomUUID()}`;

  try {
    return await db.tx(async (tx) => {
      const attribution = await latestValidAttribution(tx, { visitorId: ctx.visitorId });
      const [u] = await tx.query<UserRow>(
        `insert into lastro.users (id, name, email, phone, password_hash, password_salt, password_iterations, referred_by_affiliate_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [userId, n.value, email.value, phone.value, hash, salt, PBKDF2_ITERATIONS, attribution?.affiliate_id ?? null],
      );
      await linkVisitorToUser(tx, ctx.visitorId, u.id);
      await createUserSync(config).created(tx, u.id);
      const synced = await loadCentralisUser(tx, u.id);
      await enqueue(tx, config, "signup", {
        // Centralis creates the user from the signup event: same allowlisted shape as user.*.
        user: synced ? serializeUserForCentralis(synced) : { external_user_id: u.id },
        visitor_id: ctx.visitorId,
        affiliate: attribution ? { centralis_affiliate_id: attribution.centralis_affiliate_id, code: attribution.code } : null,
      });
      const s = await createSession(tx, u.id);
      return { ok: true as const, value: { session: toClientSession(u), ...s } };
    });
  } catch (e) {
    // Two sign-ups racing for the same e-mail or phone: the unique index decides.
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) return { ok: false, error: /phone/i.test(e.message) ? phoneTaken : emailTaken };
    throw e;
  }
}

export async function signIn(
  db: Db,
  config: CentralisConfig,
  input: { identifier: unknown; password: unknown },
  ctx: RequestContext,
): Promise<Result<{ session: ClientSession; token: string; expires: Date }>> {
  const id = parseIdentifier(String(input.identifier ?? ""));
  if (!id.ok) return id;
  const user = await findByIdentifier(db, id.value);
  // Hash even when the user doesn't exist, so both paths take similar time.
  const hash = await hashPassword(String(input.password ?? ""), user?.password_salt ?? "00".repeat(16), user?.password_iterations ?? PBKDF2_ITERATIONS);
  if (!user || !safeEqual(hash, user.password_hash) || user.status !== "active") return { ok: false, error: INVALID_CREDENTIALS };

  return db.tx(async (tx) => {
    await linkVisitorToUser(tx, ctx.visitorId, user.id);
    await enqueue(tx, config, "login", { user: { external_user_id: user.id }, visitor_id: ctx.visitorId });
    const s = await createSession(tx, user.id);
    return { ok: true as const, value: { session: toClientSession(user), ...s } };
  });
}
