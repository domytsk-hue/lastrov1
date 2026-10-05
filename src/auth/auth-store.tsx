"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hashPassword, parseIdentifier, PBKDF2_ITERATIONS, randomSalt, safeEqual, validateName, validatePassword, type Identifier, type Result } from "@/auth/rules";

/**
 * Accounts live on this device for now: a registry of users with salted PBKDF2 hashes,
 * and a session pointing at one of them. `AuthService` is the seam where a real API goes —
 * the screens only talk to this interface.
 */

export interface Session {
  userId: string;
  name: string;
  identifier: Identifier | null; // null for the demo account
  demo: boolean;
}

export interface SignUpInput {
  name: string;
  identifier: string;
  password: string;
}

export interface AuthService {
  signUp(input: SignUpInput): Promise<Result<Session>>;
  signIn(identifier: string, password: string): Promise<Result<Session>>;
  /** Enters the demo account with Lucas' data — no credentials. */
  enterDemo(): Session;
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
  async signUp({ name, identifier, password }) {
    const n = validateName(name);
    if (!n.ok) return n;
    const id = parseIdentifier(identifier);
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

  enterDemo() {
    return { userId: DEMO_USER_ID, name: "Lucas", identifier: null, demo: true };
  },
};

interface AuthContextValue {
  /** undefined while reading storage, null when signed out. */
  session: Session | null | undefined;
  signUp: (input: SignUpInput) => Promise<Result<Session>>;
  signIn: (identifier: string, password: string) => Promise<Result<Session>>;
  enterDemo: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, service = localAuthService }: { children: React.ReactNode; service?: AuthService }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      setSession(raw ? (JSON.parse(raw) as Session) : null);
    } catch {
      setSession(null);
    }
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

  const enterDemo = useCallback(() => persist(service.enterDemo()), [service, persist]);
  const signOut = useCallback(() => persist(null), [persist]);

  const value = useMemo(() => ({ session, signUp, signIn, enterDemo, signOut }), [session, signUp, signIn, enterDemo, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
