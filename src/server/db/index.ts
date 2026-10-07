import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The one database seam. Production: Supabase Postgres through DATABASE_URL (postgres.js,
 * transaction-pooler friendly). Development and tests without DATABASE_URL: an embedded
 * Postgres (PGlite) running the very same migrations from supabase/migrations.
 */

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs fn in one transaction. Inside, `tx` is the same Db bound to that transaction. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export function migrationSql(dir = join(process.cwd(), "supabase", "migrations")): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

/* ----------------------------------- PGlite ----------------------------------- */

interface PGliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: { query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }) => Promise<T>): Promise<T>;
}

function fromPglite(pg: PGliteLike): Db {
  const wrap = (q: { query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }, inTx: boolean): Db => ({
    query: async <T>(text: string, params?: unknown[]) => (await q.query<T>(text, params)).rows,
    tx: inTx ? (fn) => fn(wrap(q, true)) : (fn) => pg.transaction((t) => fn(wrap(t, true))),
  });
  return wrap(pg, false);
}

/** In-memory (dataDir undefined) or on-disk embedded Postgres with migrations applied. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = (await PGlite.create(dataDir)) as unknown as PGliteLike;
  for (const sql of migrationSql()) await pg.exec(sql);
  return fromPglite(pg);
}

/* ---------------------------------- postgres.js ---------------------------------- */

export async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  // prepare:false keeps it compatible with Supabase's transaction pooler (port 6543).
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  type Q = { unsafe: (text: string, params?: never[]) => Promise<unknown> };
  const wrap = (q: Q, inTx: boolean): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await q.unsafe(text, params as never[])) as T[],
    tx: inTx ? (fn) => fn(wrap(q, true)) : (fn) => sql.begin((t) => fn(wrap(t as unknown as Q, true))) as Promise<never>,
  });
  return wrap(sql as unknown as Q, false);
}

/* ------------------------------------ singleton ------------------------------------ */

const g = globalThis as unknown as { __lastroDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__lastroDb) {
    const url = process.env.DATABASE_URL;
    if (url) g.__lastroDb = createPostgresDb(url);
    else if (process.env.NODE_ENV === "production" && !process.env.LASTRO_ALLOW_EMBEDDED_DB) {
      g.__lastroDb = Promise.reject(new Error("DATABASE_URL is required in production (Supabase connection string)."));
    } else g.__lastroDb = createPgliteDb(process.env.LASTRO_EMBEDDED_DB_DIR || join(process.cwd(), ".data", "pglite"));
  }
  return g.__lastroDb;
}

/** Tests inject their own database. */
export function setDbForTests(db: Db) {
  g.__lastroDb = Promise.resolve(db);
}
