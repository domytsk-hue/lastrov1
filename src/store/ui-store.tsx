"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CategoryId, Transaction, TransactionType } from "@/lib/types";

export interface ComposerRequest {
  type?: TransactionType;
  categoryId?: CategoryId;
  /** Pre-select a goal (for "Guardar" flows) or the reserve. */
  goalId?: string;
  toReserve?: boolean;
  /** Transfer destination account, e.g. paying the credit card. */
  toAccountId?: string;
  /** Edit an existing transaction. */
  edit?: Transaction;
  /** Text to start with in the smart field, e.g. from a lesson's action. */
  text?: string;
}

/** A money particle flying from where an action happened to where it lands. */
export interface Flow {
  id: number;
  text: string;
  tone: "spend" | "gain" | "save";
  from: { x: number; y: number };
  /** CSS selector of the destination, e.g. [data-flow-target="balance"]. */
  to: string;
}

interface UIContextValue {
  flows: Flow[];
  emitFlow: (f: Omit<Flow, "id">) => void;
  endFlow: (id: number) => void;
  privacy: boolean;
  togglePrivacy: () => void;
  composer: ComposerRequest | null;
  openComposer: (req?: ComposerRequest) => void;
  closeComposer: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(false);
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const emitFlow = useCallback((f: Omit<Flow, "id">) => setFlows((xs) => [...xs, { ...f, id: Date.now() + Math.random() }]), []);
  const endFlow = useCallback((id: number) => setFlows((xs) => xs.filter((x) => x.id !== id)), []);

  useEffect(() => {
    try {
      setPrivacy(window.localStorage.getItem("lastro:privacy") === "1");
    } catch {}
  }, []);

  const togglePrivacy = useCallback(() => {
    setPrivacy((p) => {
      try {
        window.localStorage.setItem("lastro:privacy", p ? "0" : "1");
      } catch {}
      return !p;
    });
  }, []);

  const openComposer = useCallback((req: ComposerRequest = {}) => setComposer(req), []);
  const closeComposer = useCallback(() => setComposer(null), []);

  // Keyboard: "n" opens the composer on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setComposer((c) => c ?? {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({ flows, emitFlow, endFlow, privacy, togglePrivacy, composer, openComposer, closeComposer }),
    [flows, emitFlow, endFlow, privacy, togglePrivacy, composer, openComposer, closeComposer],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside UIProvider");
  return ctx;
}
