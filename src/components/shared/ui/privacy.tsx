"use client";

import { createContext, useContext } from "react";

/**
 * "Hide values" mode, as a tiny context the shared money components can read without
 * knowing anything about the product. The product's UI store provides it; anywhere else
 * (e.g. the marketing site) it defaults to visible.
 */
const PrivacyContext = createContext(false);

export const PrivacyProvider = PrivacyContext.Provider;

export function usePrivacy() {
  return useContext(PrivacyContext);
}
