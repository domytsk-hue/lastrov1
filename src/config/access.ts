/**
 * The shape of a user's plan access as the server reports it (GET /api/me/access, the /app
 * layout). Shared by the server, which computes it, and the UI, which only displays it and
 * uses it to choose where to navigate. The UI never decides access on its own.
 */

export type AccessState = "lifetime" | "monthly" | "granted" | "expired" | "none";

export interface PendingOrderSummary {
  id: string;
  planId: string;
  method: string | null;
  purpose: "new" | "upgrade";
  createdAt: string;
  expiresAt: string | null;
}

export interface AccessSummary {
  /** Paywall in force for this deployment (LASTRO_PAYWALL=on). */
  paywall: boolean;
  /** May use the paid product right now. Always true while the paywall is off. */
  active: boolean;
  state: AccessState;
  /** The plan that is currently effective (vitalício wins over mensal). */
  planId: "mensal" | "vitalicio" | null;
  /** End of the paid monthly time, including periods already paid in advance. */
  validUntil: string | null;
  subscription: { status: string; cancelAtPeriodEnd: boolean; nextChargeAt: string | null } | null;
  /** A renewal cancellation Lastro is still trying to confirm with the gateway. */
  renewalCancellationPending: boolean;
  pendingOrder: PendingOrderSummary | null;
  /** The person chose "Pagar depois" (navigation only). */
  deferred: boolean;
}
