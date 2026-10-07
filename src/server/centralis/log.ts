/**
 * Integration logs. Only identifiers and status codes — never payloads, so a CPF, password
 * or token can't end up in a log line even by accident.
 */
type Safe = { event_id?: string; action_id?: string; product_id?: string; external_user_id?: string; status?: string | number; code?: string; count?: number };

export function centralisLog(level: "info" | "warn" | "error", message: string, fields: Safe = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = { scope: "centralis", level, message, ...fields };
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(JSON.stringify(line));
}
