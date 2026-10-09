"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hashPassword, parseIdentifier, PBKDF2_ITERATIONS, randomSalt, safeEqual, validateName, validatePassword, type Identifier, type Result } from "@/auth/rules";

/**
 * Accounts live on the server (Supabase Postgres, via /api/auth/*) with an httpOnly session
 * cookie. The screens only talk to `AuthService`.
 *
 * Accounts created before that lived only on this device (a registry with salted PBKDF2
 * hashes). They move to the server the next time their owner signs in: the password is
 * checked against the local hash, the account is created on the server, and the device's
 * financial data is carried over to the new id.
 */

export interface Session {
  userId: string;
  name: string;
  identifier: Identifier | null; // null for the demo account
  demo: boolean;
}

export interface SignUpInput {
  name: string;
  /** Both are required for a new account; either one signs in later. */
  email: string;
  phone: string;
  password: string;
}

export interface AuthService {
  signUp(input: SignUpInput): Promise<Result<Session>>;
  signIn(identifier: string, password: string): Promise<Result<Session>>;
}

interface StoredUser {
  id: string;
  name: string;
  identifier: Identifier;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: string;
}

const USERS_KEY = "lastro:users";
const SESSION_KEY = "lastro:session";
export const DEMO_USER_ID = "demo";

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

const toSession = (u: StoredUser): Session => ({ userId: u.id, name: u.name, identifier: u.identifier, demo: false });

const INVALID_CREDENTIALS = "E-mail, telefone ou senha incorretos.";

export const localAuthService: AuthService = {
  async signUp({ name, email, password }) {
    const n = validateName(name);
    if (!n.ok) return n;
    // On-device accounts (tests only) are keyed by the e-mail.
    const id = parseIdentifier(email);
    if (!id.ok) return id;
    const pw = validatePassword(password);
    if (!pw.ok) return pw;

    const users = readUsers();
    if (users.some((u) => u.identifier.value === id.value.value)) {
      return { ok: false, error: id.value.kind === "email" ? "Já existe uma conta com esse e-mail. Que tal entrar?" : "Já existe uma conta com esse telefone. Que tal entrar?" };
    }
    const salt = randomSalt();
    const user: StoredUser = {
      id: `u_${crypto.randomUUID()}`,
      name: n.value,
      identifier: id.value,
      salt,
      hash: await hashPassword(password, salt),
      iterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    try {
      writeUsers([...users, user]);
    } catch {
      return { ok: false, error: "Não foi possível salvar neste aparelho. Verifique se o navegador permite armazenamento." };
    }
    return { ok: true, value: toSession(user) };
  },

  async signIn(identifier, password) {
    const id = parseIdentifier(identifier);
    if (!id.ok) return id;
    const user = readUsers().find((u) => u.identifier.value === id.value.value);
    // Hash even when the user doesn't exist, so both paths take similar time.
    const hash = await hashPassword(password, user?.salt ?? "00".repeat(16), user?.iterations ?? PBKDF2_ITERATIONS);
    if (!user || !safeEqual(hash, user.hash)) return { ok: false, error: INVALID_CREDENTIALS };
    return { ok: true, value: toSession(user) };
  },

};

/* ------------------------------ server-backed accounts ------------------------------ */

const NETWORK_ERROR = "Não foi possível conectar. Verifique sua internet e tente de novo.";

async function postAuth(path: string, body: unknown): Promise<Result<Session>> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const data = (await res.json()) as { ok: boolean; session?: Session; error?: string };
    return data.ok && data.session ? { ok: true, value: data.session } : { ok: false, error: data.error ?? INVALID_CREDENTIALS };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

/** Moves this device's financial data from the old local id to the server account id. */
function carryOverLocalData(fromUserId: string, toUserId: string) {
  try {
    const from = `lastro:state:${fromUserId}`;
    const data = window.localStorage.getItem(from);
    if (data && !window.localStorage.getItem(`lastro:state:${toUserId}`)) window.localStorage.setItem(`lastro:state:${toUserId}`, data);
    window.localStorage.removeItem(from);
    writeUsers(readUsers().filter((u) => u.id !== fromUserId));
  } catch {
    /* data stays under the old key; nothing is lost */
  }
}

export const apiAuthService: AuthService = {
  async signUp({ name, email, phone, password }) {
    const r = await postAuth("/api/auth/signup", { name, email, phone, password });
    if (!r.ok) return r;
    // An old on-device account with this e-mail or phone and this password: bring its data along.
    for (const raw of [email, phone]) {
      const id = parseIdentifier(raw);
      const legacy = id.ok ? readUsers().find((u) => u.identifier.value === id.value.value) : undefined;
      if (legacy && (await localAuthService.signIn(raw, password)).ok) {
        carryOverLocalData(legacy.id, r.value.userId);
        break;
      }
    }
    return r;
  },

  async signIn(identifier, password) {
    const remote = await postAuth("/api/auth/login", { identifier, password });
    if (remote.ok || remote.error === NETWORK_ERROR) return remote;

    // Not on the server yet? If this device holds the account and the password matches,
    // migrate it now — the person just sees a normal sign-in.
    const id = parseIdentifier(identifier);
    if (!id.ok) return remote;
    const legacy = readUsers().find((u) => u.identifier.value === id.value.value);
    if (!legacy) return remote;
    const local = await localAuthService.signIn(identifier, password);
    if (!local.ok) return remote;
    // A new account needs e-mail AND phone: the person creates it once, and this device's
    // data comes along (see signUp).
    return { ok: false, error: "Sua conta precisa ser atualizada: toque em “Criar conta” e use seu e-mail, telefone e a mesma senha. Seus dados deste aparelho serão mantidos." };
  },

};

interface AuthContextValue {
  /** undefined while reading storage, null when signed out. */
  session: Session | null | undefined;
  signUp: (input: SignUpInput) => Promise<Result<Session>>;
  signIn: (identifier: string, password: string) => Promise<Result<Session>>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, service = apiAuthService }: { children: React.ReactNode; service?: AuthService }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // The cached session renders instantly (and keeps the app usable offline); the server
    // cookie is the authority and corrects it when reachable.
    let cached: Session | null = null;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      cached = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cached = null;
    }
    // The demonstration account no longer exists: a demo session saved on this device is
    // discarded (with its sample data), and the person signs in or creates an account.
    if (cached?.demo) {
      try {
        window.localStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(`lastro:state:${DEMO_USER_ID}`);
      } catch {
        /* nothing saved to remove */
      }
      cached = null;
    }
    setSession(cached);
    let alive = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ session: Session | null }>) : Promise.reject()))
      .then(({ session: server }) => {
        if (!alive) return;
        try {
          if (server) window.localStorage.setItem(SESSION_KEY, JSON.stringify(server));
          else window.localStorage.removeItem(SESSION_KEY);
        } catch {
          /* memory only */
        }
        setSession(server);
      })
      .catch(() => {
        /* offline or server unavailable: keep the cached session */
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((s: Session | null) => {
    try {
      if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* the session still works in memory */
    }
    setSession(s);
  }, []);

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const r = await service.signUp(input);
      if (r.ok) persist(r.value);
      return r;
    },
    [service, persist],
  );

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const r = await service.signIn(identifier, password);
      if (r.ok) persist(r.value);
      return r;
    },
    [service, persist],
  );

  const signOut = useCallback(() => {
    if (session && !session.demo) void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    persist(null);
  }, [persist, session]);

  const value = useMemo(() => ({ session, signUp, signIn, signOut }), [session, signUp, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
