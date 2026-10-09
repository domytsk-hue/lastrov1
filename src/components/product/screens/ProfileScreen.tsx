"use client";

import { AtSign, Camera, Check, ChevronRight, Loader2, Eye, EyeOff, Fingerprint, KeyRound, Landmark, Lock, LogOut, Phone, RotateCcw, Shapes, Target } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/product/data/categories";
import { formatIdentifier, passwordChecks, validatePassword } from "@/auth/rules";
import { evaluate } from "@/product/domain/calculator";
import { photoToAvatar } from "@/lib/image";
import { cn } from "@/lib/cn";
import { lastroLevel, lastroScore, streak } from "@/product/domain/finance";
import { formatMonthYear, formatNumber } from "@/lib/format";
import type { User } from "@/product/domain/types";
import { useAuth } from "@/auth/auth-store";
import { useFinance } from "@/product/store/finance-store";
import { useUI } from "@/product/store/ui-store";
import { LastroMark } from "@/components/shared/brand/LastroMark";
import { Avatar } from "@/components/shared/ui/Avatar";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { TextField } from "@/components/auth/AuthScreen";
import { CategoryIcon } from "@/components/product/ui/CategoryIcon";
import { AffiliateSection } from "@/components/product/profile/AffiliateSection";
import { PlanSection } from "@/components/product/profile/PlanSection";
import { Button, Field, PageHeader, inputClass } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";
import { ROUTES } from "@/config/routes";

const OBJECTIVES: { value: User["objective"]; label: string }[] = [
  { value: "organize", label: "Organizar meu dinheiro" },
  { value: "reserve", label: "Construir reserva de emergência" },
  { value: "debt", label: "Sair das dívidas" },
  { value: "goal", label: "Juntar para uma meta" },
  { value: "invest", label: "Começar a investir" },
  { value: "wealth", label: "Fazer meu patrimônio crescer" },
];

export function ProfileScreen() {
  const { state, today, resetDemo, isDemo } = useFinance();
  const { session, signOut } = useAuth();
  const { privacy, togglePrivacy } = useUI();
  const toast = useToast();
  const [sheet, setSheet] = useState<"profile" | "categories" | "password" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { score } = lastroScore(state, today);
  const s = streak(state, today);

  return (
    <>
      <PageHeader eyebrow="Perfil" title={state.user.name} />

      <section className="surface-light mb-8 flex flex-col gap-5 rounded-[36px] p-6 sm:flex-row sm:items-center">
        <PhotoPicker />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
            <LastroMark size={22} progress={score / 100} />
            Lastro {score} · {lastroLevel(score).name}
          </p>
          <p className="mt-1 text-[14px] text-ink-500">
            No Lastro desde {formatMonthYear(state.user.memberSince)} · {s} {s === 1 ? "dia" : "dias"} seguidos
          </p>
        </div>
      </section>

      {!isDemo && session && !session.demo && <PlanSection />}

      <AffiliateSection enabled={!isDemo && !!session && !session.demo} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Group title="Conta">
          {session?.identifier ? (
            <Row
              icon={session.identifier.kind === "email" ? <AtSign className="size-[18px]" /> : <Phone className="size-[18px]" />}
              label={session.identifier.kind === "email" ? "E-mail" : "Telefone"}
              value={formatIdentifier(session.identifier)}
              disabled
            />
          ) : (
            <Row icon={<AtSign className="size-[18px]" />} label="Modo demonstração" value="Sem conta" disabled />
          )}
          <li>
            <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-900/[0.03]">
              <span className="grid size-9 place-items-center rounded-full bg-rose/10 text-rose-ink">
                <LogOut className="size-[18px]" />
              </span>
              <span className="flex-1 text-[15px] font-medium">{isDemo ? "Sair da demonstração" : "Sair"}</span>
            </button>
          </li>
        </Group>

        <Group title="Você">
          <Row icon={<Target className="size-[18px]" />} label="Objetivo" value={OBJECTIVES.find((o) => o.value === state.user.objective)?.label} onClick={() => setSheet("profile")} />
          <Row icon={<Landmark className="size-[18px]" />} label="Contas" value={`${state.accounts.length} contas`} href={`${ROUTES.movimentos}?aba=contas`} />
          <Row icon={<Shapes className="size-[18px]" />} label="Categorias" value={`${EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length}`} onClick={() => setSheet("categories")} />
        </Group>

        <Group title="Preferências">
          <li>
            <button onClick={togglePrivacy} role="switch" aria-checked={privacy} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="grid size-9 place-items-center rounded-full bg-ink-900/5 text-ink-700">
                <Eye className="size-[18px]" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-medium">Ocultar valores</span>
                <span className="text-[13px] text-ink-400">Para abrir o app em público</span>
              </span>
              <span className={cn("relative h-7 w-12 rounded-full transition-colors", privacy ? "bg-mint" : "bg-ink-900/15")}>
                <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-transform", privacy ? "translate-x-6" : "translate-x-1")} />
              </span>
            </button>
          </li>
        </Group>

        <Group title="Segurança">
          {!isDemo && session && !session.demo && <Row icon={<Lock className="size-[18px]" />} label="Alterar senha" onClick={() => setSheet("password")} />}
          <Row icon={<Fingerprint className="size-[18px]" />} label="Desbloqueio por biometria" value="Em breve" disabled />
          <Row icon={<KeyRound className="size-[18px]" />} label="Seus dados" value="Salvos só neste aparelho" disabled />
        </Group>

        <Group title={isDemo ? "Demonstração" : "Dados"}>
          <li className="px-4 py-3.5">
            {confirmReset ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] text-ink-500">{isDemo ? "Apagar suas alterações e voltar aos dados do Lucas?" : "Apagar todas as movimentações, metas e orçamentos desta conta?"}</p>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    resetDemo();
                    setConfirmReset(false);
                    toast.show({ title: isDemo ? "Dados de demonstração restaurados" : "Seus dados foram apagados", tone: "neutral" });
                  }}
                >
                  {isDemo ? "Restaurar" : "Apagar"}
                </Button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="flex w-full items-center gap-3 text-left">
                <span className="grid size-9 place-items-center rounded-full bg-ink-900/5 text-ink-700">
                  <RotateCcw className="size-[18px]" />
                </span>
                <span className="flex-1 text-[15px] font-medium">{isDemo ? "Restaurar dados de demonstração" : "Começar do zero"}</span>
              </button>
            )}
          </li>
        </Group>
      </div>

      <BottomSheet open={sheet === "profile"} onClose={() => setSheet(null)} title="Objetivo e renda">
        {sheet === "profile" && <ProfileForm onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === "password"} onClose={() => setSheet(null)} title="Alterar senha">
        {sheet === "password" && <PasswordForm onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Categorias">
        <p className="eyebrow mb-2 text-ink-500">Gastos</p>
        <ul className="mb-5 grid grid-cols-2 gap-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-[20px] bg-white p-2.5 text-[14px]">
              <CategoryIcon id={c.id} size={32} />
              {c.name}
            </li>
          ))}
        </ul>
        <p className="eyebrow mb-2 text-ink-500">Receitas</p>
        <ul className="grid grid-cols-2 gap-2">
          {INCOME_CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-[20px] bg-white p-2.5 text-[14px]">
              <CategoryIcon id={c.id} size={32} />
              {c.name}
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="eyebrow mb-3 px-2 text-ink-500">{title}</h2>
      <ul className="surface-light divide-y divide-ink-900/5 overflow-hidden rounded-[32px]">{children}</ul>
    </section>
  );
}

function Row({ icon, label, value, onClick, href, disabled }: { icon: React.ReactNode; label: string; value?: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span className="grid size-9 place-items-center rounded-full bg-ink-900/5 text-ink-700">{icon}</span>
      <span className="shrink-0 text-[15px] font-medium">{label}</span>
      {value && <span className="min-w-0 flex-1 truncate text-right text-[14px] text-ink-400">{value}</span>}
      {!disabled && <ChevronRight className="size-4 text-ink-400" />}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-900/[0.03]";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : (
        <button onClick={onClick} disabled={disabled} className={cn(cls, "disabled:hover:bg-transparent")}>
          {inner}
        </button>
      )}
    </li>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useFinance();
  const toast = useToast();
  const [name, setName] = useState(state.user.name);
  const [income, setIncome] = useState(formatNumber(state.user.monthlyIncome, 0));
  const [objective, setObjective] = useState(state.user.objective);
  const incomeValue = evaluate(income)?.value ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Renda mensal">
        <input className={inputClass} inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </Field>
      <div>
        <p className="mb-1.5 text-[14px] font-semibold text-ink-700">Objetivo principal</p>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Objetivo principal">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={objective === o.value}
              onClick={() => setObjective(o.value)}
              className={cn("rounded-full px-5 py-3.5 text-left text-[14px] font-medium", objective === o.value ? "bg-midnight text-white" : "bg-white text-ink-700")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        size="lg"
        disabled={!name.trim() || incomeValue <= 0}
        onClick={() => {
          dispatch({ type: "user/set", patch: { name: name.trim(), monthlyIncome: incomeValue, objective } });
          toast.show({ title: "Perfil atualizado" });
          onDone();
        }}
      >
        Salvar
      </Button>
    </div>
  );
}

/** New password for the signed-in account: just the new one, saved on the server. */
function PasswordForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = validatePassword(password);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!valid.ok || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        toast.show({ title: "Senha alterada", body: "Use a nova senha no próximo acesso." });
        onDone();
        return;
      }
      setError(res.status === 401 ? "Sua sessão expirou. Entre de novo para alterar a senha." : (data.error ?? "Não foi possível salvar. Tente de novo."));
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Nova senha"
        name="new-password"
        icon={<Lock className="size-[18px]" />}
        type={show ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="Digite a nova senha"
        maxLength={128}
        autoFocus
        error={submitted && !valid.ok ? valid.error : null}
        trailing={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="grid size-10 place-items-center rounded-full text-ink-500 hover:text-ink-900"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        }
      />
      <ul className="-mt-1 flex flex-wrap gap-x-4 gap-y-1.5 pl-2" aria-label="Requisitos da senha">
        {passwordChecks(password).map((c) => (
          <li key={c.id} className={cn("flex items-center gap-1.5 text-[12px] transition-colors", c.ok ? "text-mint-ink" : submitted ? "text-rose-ink" : "text-ink-500")}>
            <span className={cn("grid size-4 place-items-center rounded-full", c.ok ? "bg-mint/20" : "bg-ink-900/[0.06]")}>{c.ok && <Check className="size-3" strokeWidth={3} />}</span>
            {c.label}
            <span className="sr-only">{c.ok ? "— atendido" : "— pendente"}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="rounded-[22px] bg-rose/10 px-4 py-3 text-[14px] text-rose-ink">
          {error}
        </p>
      )}
      <p className="pl-2 text-[13px] text-ink-500">Por segurança, outros aparelhos conectados nesta conta vão precisar entrar de novo.</p>
      <Button size="lg" type="submit" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar nova senha"}
      </Button>
    </form>
  );
}

/** Tap the avatar to choose a photo (camera or gallery on mobile). It's cropped and shrunk on the device. */
function PhotoPicker() {
  const { state, dispatch } = useFinance();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = state.user.photo;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await photoToAvatar(file);
      dispatch({ type: "user/set", patch: { photo: dataUrl } });
      toast.show({ title: photo ? "Foto atualizada" : "Foto adicionada" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      toast.show({
        title: "Não deu para usar essa imagem",
        body: reason === "too-large" ? "Escolha uma foto com menos de 15 MB." : reason === "not-image" ? "Escolha um arquivo de imagem." : "Tente outra foto.",
        tone: "attention",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative rounded-full transition-transform active:scale-95 disabled:opacity-70"
        aria-label={photo ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
      >
        <Avatar name={state.user.name} photo={photo} size={88} />
        <span className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-midnight text-white shadow-[0_6px_14px_-6px_rgba(7,26,59,0.8)] ring-4 ring-white transition-transform group-hover:scale-105">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-[15px] font-semibold text-electric hover:underline">
          {photo ? "Trocar foto" : "Adicionar foto"}
        </button>
        {photo && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "user/set", patch: { photo: undefined } });
              toast.show({ title: "Foto removida", tone: "neutral", action: { label: "Desfazer", onClick: () => dispatch({ type: "user/set", patch: { photo } }) } });
            }}
            className="text-[14px] font-medium text-ink-500 hover:text-rose-ink"
          >
            Remover
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} />
    </div>
  );
}
