"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, AtSign, Check, Eye, EyeOff, Loader2, Lock, Phone, Sparkles, UserRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { firstName, formatIdentifier, maskIdentifierInput, parseIdentifier, passwordChecks, validateName, validatePassword } from "@/lib/auth";
import { useAuth } from "@/store/auth-store";
import { LastroMark } from "@/components/shell/LastroMark";
import { Segmented } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type Mode = "entrar" | "cadastro";

export function AuthScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mode: Mode = params.get("modo") === "cadastro" ? "cadastro" : "entrar";
  const setMode = (m: Mode) => router.replace(m === "cadastro" ? `${pathname}?modo=cadastro` : pathname, { scroll: false });
  const reduce = useReducedMotion();

  return (
    <div className="relative z-10 flex min-h-dvh">
      {/* Brand panel (desktop) */}
      <aside className="relative m-4 hidden w-[46%] overflow-hidden rounded-[44px] text-white shadow-[0_30px_70px_-28px_rgba(22,80,180,0.6)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,#8ccbff_0%,#4f9ff8_30%,#3678f5_58%,#173d91_100%)]" aria-hidden />
        <div
          className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(80% 70% at 20% 10%, black, transparent 75%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-2.5">
          <LastroMark size={32} tone="light" />
          <span className="font-display text-[23px] font-semibold tracking-[-0.03em]">lastro</span>
        </div>
        <div className="relative">
          <motion.div initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <LastroMark size={148} progress={0.84} tone="light" />
          </motion.div>
          <h2 className="mt-10 max-w-md font-display text-[44px] leading-[1.05] font-semibold tracking-[-0.035em]">Sua vida financeira, visivelmente avançando.</h2>
          <ul className="mt-8 flex flex-col gap-3 text-[15px] text-white/80">
            {["Seu Lastro: a base que fica mais forte a cada passo", "Pulso: dez segundos para saber como está seu dia", "Metas com data de chegada, no seu ritmo"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-white/20">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-white/50">Controle, calma e progresso. Nunca culpa.</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LastroMark size={34} />
            <span className="font-display text-[23px] font-semibold tracking-[-0.03em]">lastro</span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <h1 className="font-display text-[38px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink-900">{mode === "entrar" ? "Bom te ver de novo." : "Seu progresso começa aqui."}</h1>
              <p className="mt-2 text-[16px] text-ink-500">{mode === "entrar" ? "Entre com seu e-mail ou telefone." : "Leva menos de um minuto. Só nome, contato e senha."}</p>
            </motion.div>
          </AnimatePresence>

          <Segmented
            label="Entrar ou criar conta"
            value={mode}
            onChange={setMode}
            className="mt-7 mb-6"
            options={[
              { value: "entrar", label: "Entrar" },
              { value: "cadastro", label: "Criar conta" },
            ]}
          />

          <AuthForm key={mode} mode={mode} onSwitch={setMode} />

          <div className="my-7 flex items-center gap-3 text-[13px] text-ink-400" aria-hidden>
            <span className="h-px flex-1 bg-ink-900/10" />
            ou
            <span className="h-px flex-1 bg-ink-900/10" />
          </div>
          <DemoButton />

          <p className="mt-8 flex items-start gap-2 text-[13px] leading-relaxed text-ink-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Nesta versão, sua conta e seus dados ficam salvos apenas neste aparelho. A senha é guardada de forma criptografada.
          </p>
        </div>
      </main>
    </div>
  );
}

function DemoButton() {
  const { enterDemo } = useAuth();
  return (
    <button
      onClick={enterDemo}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white/80 text-[15px] font-semibold text-ink-900 shadow-[inset_0_1px_0_#fff,0_10px_24px_-16px_rgba(22,80,180,0.5)] transition-transform active:scale-[0.98]"
    >
      <Sparkles className="size-4 text-violet" />
      Explorar com dados de demonstração
    </button>
  );
}

/* ---------------- Form ---------------- */

type Field = "name" | "identifier" | "password";

function AuthForm({ mode, onSwitch }: { mode: Mode; onSwitch: (m: Mode) => void }) {
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const signup = mode === "cadastro";
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<Field, boolean>>({ name: false, identifier: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const parsedId = useMemo(() => parseIdentifier(identifier), [identifier]);
  const errors: Record<Field, string | null> = {
    name: signup ? (validateName(name).ok ? null : (validateName(name) as { error: string }).error) : null,
    identifier: parsedId.ok ? null : parsedId.error,
    password: signup ? (validatePassword(password).ok ? null : (validatePassword(password) as { error: string }).error) : password ? null : "Informe sua senha.",
  };
  const show = (f: Field) => (submitted || touched[f]) && errors[f];
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));
  const looksLikePhone = identifier.length > 0 && !/[a-z@]/i.test(identifier);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (errors.name || errors.identifier || errors.password) return;
    setBusy(true);
    const r = signup ? await signUp({ name, identifier, password }) : await signIn(identifier, password);
    setBusy(false);
    if (!r.ok) {
      setFormError(r.error);
      return;
    }
    toast.show(
      signup
        ? { title: `Conta criada, ${firstName(r.value.name)}.`, body: "Registre seu primeiro gasto e o Lastro começa a entender seu ritmo." }
        : { title: `Olá de novo, ${firstName(r.value.name)}.` },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {signup && (
        <TextField
          label="Nome"
          icon={<UserRound className="size-[18px]" />}
          value={name}
          onChange={setName}
          onBlur={blur("name")}
          error={show("name")}
          autoComplete="name"
          autoFocus
          placeholder="Como podemos te chamar?"
        />
      )}
      <TextField
        label="E-mail ou telefone"
        icon={looksLikePhone ? <Phone className="size-[18px]" /> : <AtSign className="size-[18px]" />}
        value={identifier}
        onChange={(v) => setIdentifier(maskIdentifierInput(v))}
        onBlur={blur("identifier")}
        error={show("identifier")}
        autoComplete={signup ? "username" : "username"}
        autoFocus={!signup}
        inputMode="email"
        placeholder="voce@email.com ou (11) 98765-4321"
        hint={parsedId.ok ? `${parsedId.value.kind === "email" ? "E-mail" : "Telefone"}: ${formatIdentifier(parsedId.value)}` : undefined}
      />
      <TextField
        label="Senha"
        icon={<Lock className="size-[18px]" />}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        onBlur={blur("password")}
        error={signup ? null : show("password")}
        autoComplete={signup ? "new-password" : "current-password"}
        placeholder={signup ? "Crie uma senha" : "Sua senha"}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="grid size-10 place-items-center rounded-full text-ink-500 hover:text-ink-900"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        }
      />
      {signup && (
        <ul className="-mt-1 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Requisitos da senha">
          {passwordChecks(password).map((c) => (
            <li key={c.id} className={cn("flex items-center gap-1.5 text-[12px] transition-colors", c.ok ? "text-mint-ink" : submitted ? "text-rose-ink" : "text-ink-500")}>
              <span className={cn("grid size-4 place-items-center rounded-full", c.ok ? "bg-mint/20" : "bg-ink-900/[0.06]")}>{c.ok && <Check className="size-3" strokeWidth={3} />}</span>
              {c.label}
              <span className="sr-only">{c.ok ? "— atendido" : "— pendente"}</span>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {formError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-[22px] bg-rose/10 px-4 py-3 text-[14px] text-rose-ink">
              {formError}
              {formError.includes("Que tal entrar") && (
                <button type="button" onClick={() => onSwitch("entrar")} className="ml-1 font-semibold text-ink-900 underline underline-offset-2">
                  Entrar
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={busy}
        className="mt-2 flex h-15 items-center justify-center gap-2 rounded-full bg-midnight text-[17px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(7,26,59,0.8)] transition-transform active:scale-[0.97] disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-label="Aguarde" /> : <>{signup ? "Criar minha conta" : "Entrar"} <ArrowRight className="size-[18px]" /></>}
      </button>

      <p className="text-center text-[15px] text-ink-500">
        {signup ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
        <button type="button" onClick={() => onSwitch(signup ? "entrar" : "cadastro")} className="font-semibold text-ink-900 underline-offset-2 hover:underline">
          {signup ? "Entrar" : "Criar agora"}
        </button>
      </p>
    </form>
  );
}

function TextField({
  label,
  icon,
  value,
  onChange,
  onBlur,
  error,
  hint,
  trailing,
  type = "text",
  ...rest
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | null | false;
  hint?: string;
  trailing?: React.ReactNode;
  type?: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "autoFocus" | "inputMode" | "placeholder">) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block pl-2 text-[14px] font-semibold text-ink-700">
        {label}
      </label>
      <div
        className={cn(
          "flex h-14 items-center gap-2 rounded-full bg-white pr-2 pl-5 shadow-[0_8px_20px_-14px_rgba(22,80,180,0.5)] transition-shadow",
          error ? "ring-2 ring-rose/60" : "focus-within:ring-2 focus-within:ring-electric",
        )}
      >
        <span className="text-ink-400" aria-hidden>
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink-900 outline-none placeholder:text-ink-400 field-input"
          {...rest}
        />
        {trailing}
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={cn("mt-1.5 text-[12px]", error ? "text-rose-ink" : "text-ink-500")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
