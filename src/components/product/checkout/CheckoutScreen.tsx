"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, AtSign, Check, CircleAlert, Clock3, Copy, CreditCard, IdCard, Loader2, LogOut, Phone, QrCode, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";
import { maskCpf, maskPhone, parseBillingName, parseCpf, parseEmail, parsePhone } from "@/lib/billing";
import { useAuth } from "@/auth/auth-store";
import type { AccessSummary } from "@/config/access";
import { PLAN_BENEFITS, PLANS, toMajorUnits, type PlanId } from "@/config/plans";
import { AUTH_ROUTES, CHECKOUT_ROUTE, MARKETING_ROUTES, ROUTES } from "@/config/routes";
import { ease, spring } from "@/design-system/motion";
import { LastroLoader, LastroMark } from "@/components/shared/brand/LastroMark";
import { Segmented } from "@/components/shared/ui/primitives";
import { TextField } from "@/components/auth/AuthScreen";

/**
 * The Lastro checkout, between sign-up and the app. It only ever ASKS the server: the price
 * comes from the catalog, the buyer from the session, and "Pagamento confirmado" appears only
 * after the server has a verified confirmation from the gateway.
 */

type Method = "pix" | "card";

type Instructions = { kind: "pix"; copyPaste: string; qrCodeImage: string | null; expiresAt: string | null } | { kind: "redirect"; url: string } | { kind: "awaiting" };

interface CheckoutInfo {
  account: { name: string; email: string | null; phone: string | null };
  access: AccessSummary;
  payments: { available: boolean; methods: Method[]; recurring: boolean };
}

type Phase =
  | { name: "form" }
  | { name: "creating" }
  | { name: "pix"; orderId: string; instructions: Extract<Instructions, { kind: "pix" }> }
  | { name: "processing"; orderId: string }
  | { name: "confirmed" }
  | { name: "closed"; reason: "failed" | "expired" | "cancelled" };

type Fields = "name" | "email" | "cpf" | "phone";

const ERRORS: Record<string, string> = {
  payments_unavailable: "Os pagamentos ainda não estão disponíveis. Você pode continuar e escolher seu plano depois.",
  already_lifetime: "Sua conta já tem o plano vitalício.",
  already_monthly: "Seu plano mensal já está ativo. Você pode mudar para o vitalício.",
  plan_not_found: "Esse plano não está disponível.",
  invalid_method: "Escolha Pix ou cartão.",
  idempotency_conflict: "Seu pedido mudou. Confira e tente de novo.",
  gateway_error: "Não conseguimos falar com o meio de pagamento agora. Tente de novo em instantes — nada foi cobrado em dobro.",
  network: "Sem conexão. Verifique sua internet e tente de novo.",
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function getJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export function CheckoutScreen({ initialPlan, orderId }: { initialPlan: PlanId | null; orderId: string | null }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const reduce = useReducedMotion();
  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: orderId ? "processing" : "form", ...(orderId ? { orderId } : {}) } as Phase);
  const [plan, setPlan] = useState<PlanId>(initialPlan ?? "vitalicio");
  const [method, setMethod] = useState<Method>("pix");
  const [values, setValues] = useState<Record<Fields, string>>({ name: "", email: "", cpf: "", phone: "" });
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Partial<Record<Fields, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deferring, setDeferring] = useState(false);
  // Same intent → same key: a double click, a retry after a timeout or a refresh can't open two charges.
  const key = useRef(newKey());
  const closed = phase.name === "closed";
  useEffect(() => {
    key.current = newKey();
  }, [plan, method, closed]);

  const load = useCallback(async () => {
    try {
      const { status, data } = await getJson<CheckoutInfo & { ok: boolean }>("/api/checkout");
      if (status === 401) {
        router.replace(`${AUTH_ROUTES.login}?next=${encodeURIComponent(CHECKOUT_ROUTE)}`);
        return;
      }
      if (!data?.ok) throw new Error();
      setInfo(data);
      setLoadError(false);
      const a = data.access;
      setValues((v) => ({
        name: v.name || data.account.name,
        email: data.account.email ?? v.email,
        cpf: v.cpf,
        phone: v.phone || (data.account.phone ? maskPhone(data.account.phone) : ""),
      }));
      // Upgrade: a monthly subscriber can only move to the lifetime plan.
      if (a.state === "monthly") setPlan("vitalicio");
      if (data.payments.methods.length && !data.payments.methods.includes("pix")) setMethod(data.payments.methods[0]);
      // An order already waiting for payment is followed, not duplicated.
      if (!orderId && a.pendingOrder) setPhase({ name: "processing", orderId: a.pendingOrder.id });
    } catch {
      setLoadError(true);
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const access = info?.access ?? null;
  const upgrade = access?.state === "monthly";
  const chosen = PLANS[plan];
  const amount = formatBRL(toMajorUnits(chosen.amountMinor));
  const accountEmail = info?.account.email ?? null;

  const errors: Record<Fields, string | null> = useMemo(() => {
    const r = (x: { ok: boolean; error?: string }) => (x.ok ? null : (x as { error: string }).error);
    return {
      name: r(parseBillingName(values.name)),
      email: accountEmail ? null : r(parseEmail(values.email)),
      cpf: r(parseCpf(values.cpf)),
      phone: r(parsePhone(values.phone)),
    };
  }, [values, accountEmail]);
  const show = (f: Fields) => serverFields[f] || ((submitted || touched[f]) && errors[f]) || null;
  const set = (f: Fields) => (v: string) => {
    setValues((s) => ({ ...s, [f]: f === "cpf" ? maskCpf(v) : f === "phone" ? maskPhone(v) : v }));
    setServerFields((s) => ({ ...s, [f]: undefined }));
  };

  const finish = useCallback(() => {
    setPhase({ name: "confirmed" });
    window.setTimeout(() => {
      router.replace(ROUTES.home);
      router.refresh();
    }, reduce ? 600 : 1600);
  }, [router, reduce]);

  /* ---------------------------- following an order ---------------------------- */

  const followId = phase.name === "pix" || phase.name === "processing" ? phase.orderId : null;
  useEffect(() => {
    if (!followId) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const { status, data } = await getJson<{ ok: boolean; order?: { status: string; instructions: Instructions | null }; access?: { active: boolean } }>(`/api/checkout/orders/${followId}`);
        if (!alive) return;
        if (status === 401) {
          router.replace(`${AUTH_ROUTES.login}?next=${encodeURIComponent(CHECKOUT_ROUTE)}`);
          return;
        }
        if (status === 404) {
          setPhase({ name: "form" });
          return;
        }
        const o = data?.order;
        if (o?.status === "approved") return finish();
        if (o && ["failed", "expired", "cancelled", "refunded"].includes(o.status)) {
          setPhase({ name: "closed", reason: o.status === "expired" ? "expired" : o.status === "cancelled" ? "cancelled" : "failed" });
          return;
        }
        if (o?.instructions?.kind === "pix") setPhase((p) => (p.name === "processing" || p.name === "pix" ? { name: "pix", orderId: followId, instructions: o.instructions as Extract<Instructions, { kind: "pix" }> } : p));
      } catch {
        /* offline for a moment: keep waiting, the server finishes the flow anyway */
      }
      if (alive) timer = window.setTimeout(tick, document.visibilityState === "visible" ? 4000 : 12000);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [followId, finish, router]);

  /* --------------------------------- submit --------------------------------- */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (!info?.payments.available) {
      setFormError(ERRORS.payments_unavailable);
      return;
    }
    if (Object.values(errors).some(Boolean)) return;
    setPhase({ name: "creating" });
    try {
      const { status, data } = await getJson<{ ok: boolean; error?: string; fields?: Partial<Record<Fields, string>>; order_id?: string; instructions?: Instructions }>("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: plan, method, name: values.name, email: values.email, cpf: values.cpf, phone: values.phone, idempotency_key: key.current }),
      });
      if (status === 401) {
        router.replace(`${AUTH_ROUTES.login}?next=${encodeURIComponent(CHECKOUT_ROUTE)}`);
        return;
      }
      if (!data?.ok || !data.order_id || !data.instructions) {
        setPhase({ name: "form" });
        if (data?.fields) setServerFields(data.fields);
        setFormError(data?.error && data.error !== "invalid_billing" ? (ERRORS[data.error] ?? ERRORS.gateway_error) : data?.fields ? null : ERRORS.gateway_error);
        if (data?.error === "already_lifetime" || data?.error === "already_monthly") void load();
        if (data?.error === "idempotency_conflict") key.current = newKey();
        return;
      }
      const ins = data.instructions;
      if (ins.kind === "redirect") {
        window.location.assign(ins.url);
        return;
      }
      setPhase(ins.kind === "pix" ? { name: "pix", orderId: data.order_id, instructions: ins } : { name: "processing", orderId: data.order_id });
    } catch {
      setPhase({ name: "form" });
      setFormError(ERRORS.network);
    }
  };

  const payLater = async () => {
    setDeferring(true);
    try {
      await fetch("/api/checkout/defer", { method: "POST", credentials: "same-origin" });
    } catch {
      /* navigation only — the app still opens */
    }
    router.replace(ROUTES.home);
    router.refresh();
  };

  /* --------------------------------- render --------------------------------- */

  if (!session && !info) return <LastroLoader />;

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 pt-[max(18px,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pt-8">
        <Link href={MARKETING_ROUTES.home} className="flex items-center gap-2.5" aria-label="Lastro — página inicial">
          <LastroMark size={30} />
          <span className="font-display text-[22px] font-semibold tracking-[-0.03em] text-ink-900">lastro</span>
        </Link>
        <button type="button" onClick={signOut} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-500 hover:bg-ink-900/5 hover:text-ink-900">
          <LogOut className="size-4" aria-hidden />
          Sair
        </button>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-16 sm:px-6 lg:px-10 lg:pt-12">
        {loadError ? (
          <Notice tone="error" title="Não foi possível abrir o checkout." action={<PillButton onClick={() => void load()}>Tentar de novo</PillButton>}>
            Verifique sua conexão. Nenhuma cobrança foi feita.
          </Notice>
        ) : !info ? (
          <LastroLoader />
        ) : access?.state === "lifetime" ? (
          <Notice tone="success" title="Seu plano vitalício está ativo." action={<PillLink href={ROUTES.home}>Abrir o Lastro</PillLink>}>
            Você já tem acesso a todos os recursos, para sempre. Não há nada para pagar.
          </Notice>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {phase.name === "confirmed" ? (
              <Confirmed key="ok" />
            ) : phase.name === "pix" ? (
              <PixPanel key="pix" amount={amount} plan={chosen.name} instructions={phase.instructions} onChange={() => setPhase({ name: "form" })} />
            ) : phase.name === "processing" ? (
              <Waiting key="wait" onChange={() => setPhase({ name: "form" })} />
            ) : (
              <motion.div key="form" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: ease.out }}>
                <h1 className="font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink-900 lg:text-[48px]">
                  {upgrade ? "Mude para o vitalício." : "Escolha seu plano."}
                </h1>
                <p className="mt-2 max-w-[56ch] text-[16px] text-ink-500">
                  {upgrade ? "Seu plano mensal continua valendo até o pagamento do vitalício ser confirmado." : "Os dois planos têm tudo do Lastro. A diferença é como você paga."}
                </p>

                {phase.name === "closed" && (
                  <Banner tone="attention" className="mt-6">
                    {phase.reason === "expired" ? "O prazo daquele Pix acabou e nada foi cobrado. Você pode gerar um novo." : phase.reason === "cancelled" ? "Aquele pedido foi substituído. Confira os dados e continue." : "O pagamento não foi aprovado e nada foi cobrado. Confira os dados ou tente outro meio."}
                  </Banner>
                )}
                {!info.payments.available && (
                  <Banner tone="info" className="mt-6">
                    <strong className="font-semibold text-ink-900">Os pagamentos ainda não estão disponíveis.</strong> Você pode continuar e escolher seu plano depois.
                  </Banner>
                )}

                <form onSubmit={submit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
                  <div className="flex min-w-0 flex-col gap-8">
                    <PlanPicker value={plan} onChange={setPlan} monthlyDisabled={upgrade} />

                    <fieldset className="surface-light rounded-[32px] p-5 sm:p-6">
                      <legend className="sr-only">Dados de cobrança</legend>
                      <p className="eyebrow mb-4 text-ink-500">Dados de cobrança</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <TextField label="Nome completo" name="name" icon={<UserRound className="size-[18px]" />} value={values.name} onChange={set("name")} onBlur={() => setTouched((t) => ({ ...t, name: true }))} error={show("name")} autoComplete="name" placeholder="Como no seu documento" maxLength={80} />
                        </div>
                        <div className="sm:col-span-2">
                          <TextField
                            label="E-mail"
                            name="email"
                            icon={<AtSign className="size-[18px]" />}
                            value={accountEmail ?? values.email}
                            onChange={set("email")}
                            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                            error={show("email")}
                            readOnly={!!accountEmail}
                            autoComplete="email"
                            inputMode="email"
                            hint={accountEmail ? "O e-mail da sua conta." : "Para o comprovante do pagamento."}
                          />
                        </div>
                        <TextField label="CPF" name="cpf" icon={<IdCard className="size-[18px]" />} value={values.cpf} onChange={set("cpf")} onBlur={() => setTouched((t) => ({ ...t, cpf: true }))} error={show("cpf")} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} />
                        <TextField label="Telefone" name="phone" icon={<Phone className="size-[18px]" />} value={values.phone} onChange={set("phone")} onBlur={() => setTouched((t) => ({ ...t, phone: true }))} error={show("phone")} inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" maxLength={16} />
                      </div>
                    </fieldset>

                    <div>
                      <p className="eyebrow mb-3 px-1 text-ink-500">Forma de pagamento</p>
                      <Segmented
                        label="Forma de pagamento"
                        value={method}
                        onChange={(m) => setMethod(m)}
                        options={[
                          { value: "pix", label: "Pix" },
                          { value: "card", label: "Cartão" },
                        ]}
                      />
                      <p className="mt-3 flex items-start gap-2 px-1 text-[14px] leading-relaxed text-ink-500">
                        {method === "pix" ? <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        {method === "pix"
                          ? "Você recebe um código Pix para pagar no app do seu banco. O acesso é liberado quando o pagamento é confirmado."
                          : "Os dados do cartão são digitados no ambiente seguro do meio de pagamento — o Lastro não vê nem guarda o número do cartão."}
                      </p>
                    </div>
                  </div>

                  <Summary
                    plan={plan}
                    method={method}
                    amount={amount}
                    recurring={info.payments.recurring}
                    upgrade={upgrade}
                    available={info.payments.available}
                    busy={phase.name === "creating"}
                    deferring={deferring}
                    error={formError}
                    onPayLater={payLater}
                    showPayLater={!upgrade}
                  />
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

/* --------------------------------- plan picker --------------------------------- */

function PlanPicker({ value, onChange, monthlyDisabled }: { value: PlanId; onChange: (p: PlanId) => void; monthlyDisabled: boolean }) {
  const order: PlanId[] = ["vitalicio", "mensal"];
  const id = useId();
  return (
    <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-2">
      {order.map((p) => {
        const plan = PLANS[p];
        const checked = value === p;
        const disabled = p === "mensal" && monthlyDisabled;
        const hero = p === "vitalicio";
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            aria-describedby={`${id}-${p}`}
            onClick={() => !disabled && onChange(p)}
            className={cn(
              "relative overflow-hidden rounded-[32px] p-5 text-left transition-[box-shadow,opacity,scale] duration-300 sm:p-6",
              hero ? "surface-hero text-white" : "surface-light text-ink-900",
              checked ? (hero ? "shadow-[0_0_0_2px_var(--color-mint),0_30px_60px_-30px_rgba(22,80,180,0.75)]" : "shadow-[0_0_0_2px_var(--color-electric),0_24px_50px_-30px_rgba(22,80,180,0.6)]") : "opacity-90 hover:opacity-100",
              disabled && "cursor-not-allowed opacity-50 hover:opacity-50",
            )}
          >
            <span className="flex items-center justify-between gap-3">
              <span className={cn("text-[13px] font-bold tracking-[0.14em] uppercase", hero ? "text-white/80" : "text-ink-500")}>{plan.name}</span>
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  hero ? (checked ? "border-mint bg-mint" : "border-white/60") : checked ? "border-electric bg-electric" : "border-ink-400",
                )}
              >
                {checked && <Check className={cn("size-4", hero ? "text-midnight" : "text-white")} strokeWidth={3} />}
              </span>
            </span>
            <span className="mt-3 block font-display text-[34px] leading-none font-semibold tracking-[-0.04em]">{formatBRL(toMajorUnits(plan.amountMinor))}</span>
            <span id={`${id}-${p}`} className={cn("mt-2 block text-[14px] font-medium", hero ? "text-white/85" : "text-ink-500")}>
              {disabled ? "Seu plano atual" : p === "mensal" ? "por mês" : "pagamento único · acesso para sempre"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------- summary ----------------------------------- */

function Summary({
  plan,
  method,
  amount,
  recurring,
  upgrade,
  available,
  busy,
  deferring,
  error,
  onPayLater,
  showPayLater,
}: {
  plan: PlanId;
  method: Method;
  amount: string;
  recurring: boolean;
  upgrade: boolean;
  available: boolean;
  busy: boolean;
  deferring: boolean;
  error: string | null;
  onPayLater: () => void;
  showPayLater: boolean;
}) {
  const p = PLANS[plan];
  const renewal =
    p.billing === "one_time"
      ? "Pagamento único. Sem mensalidade e sem renovação."
      : recurring && method === "card"
        ? "Renova todo mês no cartão até você cancelar no seu perfil. O acesso vale até o fim do mês já pago."
        : "Cada pagamento libera um mês de acesso. Não há débito automático: você renova quando quiser.";
  return (
    <aside aria-label="Resumo do pedido" className="lg:sticky lg:top-8">
      <div className="surface-light rounded-[32px] p-5 sm:p-6">
        <p className="eyebrow text-ink-500">Resumo</p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="font-display text-[22px] font-semibold tracking-[-0.025em] text-ink-900">Plano {p.name.toLowerCase()}</p>
          <p className="tabular font-display text-[22px] font-semibold tracking-[-0.025em] text-ink-900">{amount}</p>
        </div>
        <p className="mt-1 text-[14px] text-ink-500">{p.priceLabel} · BRL</p>
        <ul className="mt-5 flex flex-col gap-2">
          {PLAN_BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-[14px] text-ink-700">
              <Check className="size-4 shrink-0 text-mint-ink" strokeWidth={3} aria-hidden />
              {b}
            </li>
          ))}
        </ul>
        <dl className="mt-5 flex flex-col gap-2 border-t border-ink-900/[0.06] pt-4 text-[14px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Forma de pagamento</dt>
            <dd className="font-semibold text-ink-900">{method === "pix" ? "Pix" : "Cartão"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Cobrança</dt>
            <dd className="text-right font-semibold text-ink-900">{p.billing === "one_time" ? "Única" : "Mensal"}</dd>
          </div>
          <div className="flex justify-between gap-3 pt-1 text-[16px]">
            <dt className="font-semibold text-ink-900">Total {p.billing === "monthly" ? "por mês" : "hoje"}</dt>
            <dd className="tabular font-semibold text-ink-900">{amount}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-500">{renewal}</p>
        {upgrade && <p className="mt-2 text-[13px] leading-relaxed text-ink-500">Sem abatimento do mensal: o vitalício custa {amount}. Depois de confirmado, a renovação mensal é encerrada.</p>}

        <AnimatePresence>
          {error && (
            <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <p className="mt-4 rounded-[20px] bg-rose/10 px-4 py-3 text-[14px] text-rose-ink">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={busy || !available}
          className="mt-5 flex h-15 w-full items-center justify-center gap-2 rounded-full bg-midnight px-5 text-[16px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(7,26,59,0.8)] transition-transform active:scale-[0.97] disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden /> Criando cobrança…
            </>
          ) : available ? (
            <>
              Pagar {amount} com {method === "pix" ? "Pix" : "cartão"} <ArrowRight className="size-[18px]" aria-hidden />
            </>
          ) : (
            "Pagamentos indisponíveis no momento"
          )}
        </button>
        {showPayLater && (
          <button
            type="button"
            onClick={onPayLater}
            disabled={deferring}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-ink-700 transition-colors hover:bg-ink-900/5 disabled:opacity-60"
          >
            {deferring ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Pagar depois
          </button>
        )}
        <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Ao continuar, você concorda com os{" "}
            <Link href={MARKETING_ROUTES.termos} className="font-semibold text-ink-700 underline-offset-2 hover:underline">
              Termos
            </Link>{" "}
            e a{" "}
            <Link href={MARKETING_ROUTES.privacidade} className="font-semibold text-ink-700 underline-offset-2 hover:underline">
              Privacidade
            </Link>
            . O CPF vai só para o meio de pagamento.
          </span>
        </p>
      </div>
    </aside>
  );
}

/* ------------------------------------ Pix ------------------------------------ */

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until) return null;
  const ms = Math.max(0, Date.parse(until) - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { done: ms === 0, label: `${m}:${String(s).padStart(2, "0")}` };
}

function PixPanel({ amount, plan, instructions, onChange }: { amount: string; plan: string; instructions: Extract<Instructions, { kind: "pix" }>; onChange: () => void }) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const left = useCountdown(instructions.expiresAt);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(instructions.copyPaste);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      /* the code stays selectable below */
    }
  };
  return (
    <motion.section aria-labelledby="pix-title" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: ease.out }} className="mx-auto max-w-[560px]">
      <div className="surface-light rounded-[36px] p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-electric/10 px-3 py-1 text-[13px] font-semibold text-electric" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Aguardando pagamento
        </p>
        <h1 id="pix-title" className="mt-4 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink-900">
          Pague {amount} com Pix
        </h1>
        <p className="mt-2 text-[15px] text-ink-500">Plano {plan.toLowerCase()}. Abra o app do seu banco, escolha Pix e escaneie o código ou use o copia e cola.</p>

        {instructions.qrCodeImage ? (
          // The gateway's own QR image (data URL or its https URL).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={instructions.qrCodeImage} alt="QR Code do Pix" className="mx-auto mt-6 size-56 rounded-[24px] bg-white p-3" />
        ) : (
          <p className="mt-6 rounded-[24px] bg-ink-900/[0.04] px-4 py-6 text-center text-[14px] text-ink-500">Use o código copia e cola abaixo.</p>
        )}

        <p className="mt-6 mb-2 text-[14px] font-semibold text-ink-700">Pix copia e cola</p>
        <div className="flex items-center gap-2 rounded-[20px] bg-white p-2 pl-4 shadow-[0_8px_20px_-14px_rgba(22,80,180,0.5)]">
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-700 select-all">{instructions.copyPaste}</code>
          <button type="button" onClick={copy} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-midnight px-4 text-[14px] font-semibold text-white active:scale-[0.97]">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <span className="sr-only" aria-live="polite">
          {copied ? "Código copiado" : ""}
        </span>

        {left && (
          <p className="mt-4 flex items-center gap-2 text-[14px] text-ink-500">
            <Clock3 className="size-4" aria-hidden />
            {left.done ? "O prazo deste código terminou." : <>Este código vale por mais <span className="tabular font-semibold text-ink-900">{left.label}</span>.</>}
          </p>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-ink-500">Assim que o banco confirmar, seu acesso é liberado e você entra no app — pode deixar esta tela aberta ou voltar depois.</p>
        <button type="button" onClick={onChange} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-700 hover:bg-ink-900/5">
          <ArrowLeft className="size-4" aria-hidden /> Trocar plano ou forma de pagamento
        </button>
      </div>
    </motion.section>
  );
}

/* ------------------------------ waiting / confirmed ------------------------------ */

function Waiting({ onChange }: { onChange: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.section initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mx-auto flex max-w-[480px] flex-col items-center py-16 text-center" aria-live="polite">
      <LastroMark size={72} loading />
      <h1 className="mt-8 font-display text-[28px] font-semibold tracking-[-0.03em] text-ink-900">Aguardando confirmação do pagamento.</h1>
      <p className="mt-2 text-[15px] text-ink-500">Pode levar alguns instantes. Você não precisa pagar de novo — se fechar esta tela, a confirmação acontece mesmo assim.</p>
      <button type="button" onClick={onChange} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-ink-700 hover:bg-ink-900/5">
        <ArrowLeft className="size-4" aria-hidden /> Voltar aos planos
      </button>
    </motion.section>
  );
}

function Confirmed() {
  const reduce = useReducedMotion();
  return (
    <motion.section initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.soft} className="mx-auto flex max-w-[480px] flex-col items-center py-16 text-center" role="status">
      <motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.snappy, delay: 0.1 }} className="grid size-20 place-items-center rounded-full bg-mint text-midnight shadow-[0_18px_40px_-14px_rgba(24,224,174,0.9)]">
        <Check className="size-10" strokeWidth={3} aria-hidden />
      </motion.span>
      <h1 className="mt-8 font-display text-[32px] font-semibold tracking-[-0.03em] text-ink-900">Pagamento confirmado</h1>
      <p className="mt-2 text-[16px] text-ink-500">Seu acesso está liberado. Abrindo o Lastro…</p>
    </motion.section>
  );
}

/* ----------------------------------- bits ----------------------------------- */

function Banner({ tone, children, className }: { tone: "info" | "attention"; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-3 rounded-[24px] px-4 py-3.5 text-[15px] leading-relaxed", tone === "info" ? "bg-electric/[0.08] text-ink-700" : "bg-amber/15 text-ink-700", className)} role={tone === "attention" ? "alert" : "status"}>
      <CircleAlert className={cn("mt-0.5 size-5 shrink-0", tone === "info" ? "text-electric" : "text-amber-ink")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Notice({ tone, title, children, action }: { tone: "success" | "error"; title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <section className="mx-auto flex max-w-[520px] flex-col items-center py-12 text-center">
      <span className={cn("grid size-16 place-items-center rounded-full", tone === "success" ? "bg-mint text-midnight" : "bg-rose/15 text-rose-ink")}>
        {tone === "success" ? <Check className="size-8" strokeWidth={3} aria-hidden /> : <CircleAlert className="size-8" aria-hidden />}
      </span>
      <h1 className="mt-6 font-display text-[28px] font-semibold tracking-[-0.03em] text-ink-900">{title}</h1>
      <p className="mt-2 text-[15px] text-ink-500">{children}</p>
      <div className="mt-6">{action}</div>
    </section>
  );
}

const pill = "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-midnight px-6 text-[15px] font-semibold text-white shadow-[0_12px_26px_-12px_rgba(7,26,59,0.8)] transition-transform active:scale-[0.97]";

function PillButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={pill}>
      {children}
    </button>
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={pill}>
      {children} <ArrowRight className="size-[18px]" aria-hidden />
    </Link>
  );
}
