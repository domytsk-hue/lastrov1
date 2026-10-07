"use client";

import { createContext, useContext } from "react";
import type { AccessSummary } from "@/config/access";

/**
 * The plan access the server computed for this page load. Display and navigation only:
 * every paid page and API checks access again on the server.
 * null = no server account (the on-device demo).
 */
const AccessContext = createContext<AccessSummary | null>(null);

export const AccessProvider = AccessContext.Provider;

export function useAccess() {
  return useContext(AccessContext);
}

/** Paid modules are unavailable for this account right now. */
export const isLocked = (a: AccessSummary | null) => !!a && a.paywall && !a.active;
