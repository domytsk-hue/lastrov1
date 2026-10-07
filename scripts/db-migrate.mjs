#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql to DATABASE_URL (your Supabase Postgres).
 * Equivalent to `supabase db push`; the SQL is idempotent, so re-running is safe.
 *
 *   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" npm run db:migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const dir = join(process.cwd(), "supabase", "migrations");
const sql = postgres(url, { prepare: false, max: 1 });
try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    console.log(`✓ ${file}`);
  }
} finally {
  await sql.end();
}
