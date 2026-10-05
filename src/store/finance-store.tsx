"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDemoState, createEmptyState, STATE_VERSION } from "@/data/mock";
import { toISODate } from "@/lib/format";
import type { FinanceState } from "@/lib/types";
import { reducer, type Action } from "./reducer";

/** The demo keeps the original key so existing demo data survives the move to accounts. */
const storageKey = (userId: string) => (userId === "demo" ? "lastro:state" : `lastro:state:${userId}`);

interface FinanceContextValue {
  state: FinanceState;
  /** Local calendar day. Everything in the UI is "as of" this date. */
  today: string;
  /** Applies an action and returns the resulting state synchronously (for instant feedback). */
  dispatch: (action: Action) => FinanceState;
  /** Back to the starting point: Lucas' data in the demo, a clean slate for real accounts. */
  resetDemo: () => void;
  isDemo: boolean;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function initialState(userId: string, name: string, today: string) {
  return userId === "demo" ? createDemoState(today) : createEmptyState(today, name);
}

function load(userId: string, name: string, today: string): FinanceState {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as FinanceState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return initialState(userId, name, today);
}

export function FinanceProvider({
  children,
  fallback,
  userId,
  name,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  userId: string;
  name: string;
}) {
  const [today, setToday] = useState<string | null>(null);
  const [state, setState] = useState<FinanceState | null>(null);
  const ref = useRef<FinanceState | null>(null);

  // Client-only: dates and storage depend on the user's device.
  useEffect(() => {
    const t = toISODate(new Date());
    const s = load(userId, name, t);
    ref.current = s;
    setToday(t);
    setState(s);
  }, [userId, name]);

  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
    } catch {
      /* quota or private mode — the session still works in memory */
    }
  }, [state, userId]);

  // Roll the date over if the app stays open past midnight.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = toISODate(new Date());
      setToday((prev) => (prev !== t ? t : prev));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dispatch = useCallback((action: Action) => {
    const next = reducer(ref.current!, action);
    ref.current = next;
    setState(next);
    return next;
  }, []);

  const resetDemo = useCallback(() => {
    const t = toISODate(new Date());
    const next = initialState(userId, name, t);
    ref.current = next;
    setState(next);
  }, [userId, name]);

  const value = useMemo(
    () => (state && today ? { state, today, dispatch, resetDemo, isDemo: userId === "demo" } : null),
    [state, today, dispatch, resetDemo, userId],
  );

  if (!value) return <>{fallback}</>;
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
