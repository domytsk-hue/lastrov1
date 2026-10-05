"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDemoState, STATE_VERSION } from "@/data/mock";
import { toISODate } from "@/lib/format";
import type { FinanceState } from "@/lib/types";
import { reducer, type Action } from "./reducer";

const STORAGE_KEY = "lastro:state";

interface FinanceContextValue {
  state: FinanceState;
  /** Local calendar day. Everything in the UI is "as of" this date. */
  today: string;
  /** Applies an action and returns the resulting state synchronously (for instant feedback). */
  dispatch: (action: Action) => FinanceState;
  resetDemo: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function load(today: string): FinanceState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FinanceState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* storage unavailable or corrupt — fall back to demo data */
  }
  return createDemoState(today);
}

export function FinanceProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [today, setToday] = useState<string | null>(null);
  const [state, setState] = useState<FinanceState | null>(null);
  const ref = useRef<FinanceState | null>(null);

  // Client-only: dates and storage depend on the user's device.
  useEffect(() => {
    const t = toISODate(new Date());
    const s = load(t);
    ref.current = s;
    setToday(t);
    setState(s);
  }, []);

  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode — the session still works in memory */
    }
  }, [state]);

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
    const next = createDemoState(t);
    ref.current = next;
    setState(next);
  }, []);

  const value = useMemo(
    () => (state && today ? { state, today, dispatch, resetDemo } : null),
    [state, today, dispatch, resetDemo],
  );

  if (!value) return <>{fallback}</>;
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
