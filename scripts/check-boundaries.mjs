#!/usr/bin/env node
/**
 * Enforces Lastro's layer boundaries (see docs/architecture.md).
 *
 *   marketing → shared, design-system, lib, config, auth (session only)
 *   product   → shared, design-system, lib, config, auth
 *   auth      → shared, design-system, lib, config
 *   shared    → design-system, lib            (never product / marketing / auth)
 *   server    → server, lib, config, auth (pure rules) — never imported by UI layers,
 *               so secrets and the database can't leak into a browser bundle
 *   lib, design-system → nothing above them
 *
 * One exception: SERVER route files of the product (app/(product)/**, without "use client")
 * may import server/access/** — the per-request access check. They render on the server only,
 * and server modules import "server-only", so a client file importing them fails the build.
 *
 * Run: npm run check:boundaries
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/** Which layer a file under src/ belongs to. */
function layerOf(file) {
  const p = relative(SRC, file).replaceAll("\\", "/");
  if (p.startsWith("components/marketing/") || p.startsWith("app/(marketing)/")) return "marketing";
  if (p.startsWith("components/product/") || p.startsWith("product/") || p.startsWith("app/(product)/")) return "product";
  if (p.startsWith("components/auth/") || p.startsWith("auth/") || p.startsWith("app/(auth)/")) return "auth";
  if (p.startsWith("components/shared/")) return "shared";
  if (p.startsWith("design-system/")) return "design-system";
  if (p.startsWith("lib/")) return "lib";
  if (p.startsWith("config/")) return "config";
  if (p.startsWith("server/")) return "server";
  if (p.startsWith("app/")) return "app"; // root layout, providers: composition root, may import anything
  return "other";
}

const ALLOWED = {
  marketing: ["marketing", "shared", "design-system", "lib", "config", "auth"],
  product: ["product", "shared", "design-system", "lib", "config", "auth"],
  auth: ["auth", "shared", "design-system", "lib", "config"],
  shared: ["shared", "design-system", "lib"],
  "design-system": ["design-system"],
  lib: ["lib"],
  config: ["config"],
  server: ["server", "lib", "config", "auth"],
  app: null,
  other: null,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

function resolveImport(from, spec) {
  if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
  if (spec.startsWith(".")) return resolve(dirname(from), spec);
  return null; // package import
}

const violations = [];
for (const file of walk(SRC)) {
  const layer = layerOf(file);
  const allowed = ALLOWED[layer];
  if (!allowed) continue;
  const code = readFileSync(file, "utf8");
  const serverRoute = relative(SRC, file).replaceAll("\\", "/").startsWith("app/(product)/") && !/^\s*["']use client["']/.test(code);
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const target = resolveImport(file, m[1]);
    if (!target || !target.startsWith(SRC)) continue;
    const targetLayer = layerOf(target);
    const accessCheck = serverRoute && relative(SRC, target).replaceAll("\\", "/").startsWith("server/access/");
    if (!allowed.includes(targetLayer) && !accessCheck) {
      violations.push(`${relative(ROOT, file)}  (${layer})  →  ${m[1]}  (${targetLayer})`);
    }
  }
}

if (violations.length) {
  console.error(`✗ ${violations.length} layer boundary violation(s):\n  ` + violations.join("\n  "));
  process.exit(1);
}
console.log("✓ Layer boundaries respected (marketing · product · auth · shared · server · design-system · lib).");
