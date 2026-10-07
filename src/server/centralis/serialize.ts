/**
 * What leaves Lastro for Centralis is built here, field by field. Nothing is ever spread
 * from a database row: a column added to `users` tomorrow is not sent unless someone adds
 * it to the allowlist below on purpose.
 */

export interface CentralisUserSource {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CentralisUser {
  external_user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  plan_id: string | null;
  plan_name: string | null;
  account_status: string;
  subscription_status: string | null;
  created_at: string;
  updated_at: string;
}

/** UTC, ISO-8601. */
export const iso = (d: Date | string) => new Date(d).toISOString();

export function serializeUserForCentralis(user: CentralisUserSource): CentralisUser {
  return {
    external_user_id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    plan_id: user.plan_id,
    plan_name: user.plan_name,
    account_status: user.status,
    subscription_status: user.subscription_status,
    created_at: iso(user.created_at),
    updated_at: iso(user.updated_at),
  };
}

/**
 * Keys that must never appear anywhere in a Centralis payload. Checked recursively before
 * anything is queued — a last line of defense behind the explicit serializers.
 */
export const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /cpf/i,
  /passw/i,
  /password_?hash/i,
  /salt/i,
  /token/i,
  /secret/i,
  /api_?key/i,
  /private_?key/i,
  /cookie/i,
  /card_?number/i,
  /^pan$/i,
  /cvv|cvc/i,
  /bank_?account|agencia|iban/i,
  /credential/i,
];

export function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findForbiddenKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      ...(FORBIDDEN_KEY_PATTERNS.some((re) => re.test(k)) ? [`${path}.${k}`] : []),
      ...findForbiddenKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}
