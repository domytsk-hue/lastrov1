"use client";

import { ArrowRight, CalendarClock, Clock3, Infinity as InfinityIcon, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { AccessSummary } from "@/config/access";
import { PLANS, isPlanId } from "@/config/plans";
import { CHECKOUT_ROUTE } from "@/config/routes";
import { useAccess } from "@/components/product/access/access-context";
import { Button } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";

const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/**
 * "Seu plano" in the profile. Shows only what the server reports (GET /api/me/access) and
 * leads to the checkout; it never changes access itself.
 */
export function PlanSection() {
  const initial = useAccess();
  const toast = useToast();
  const [access, setAccess] = useState<AccessSummary | null>(initial);
  const [recurring, setRecurring] = useState(false);
  const [gatewayRenews, setGatewayRenews] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<"idle" | "confirm" | "busy">("idle");

  useEffect(() => {
    let alive = true;
    fetch("/api/me/access", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ access: AccessSummary; payments: { recurring: boolean; autoRenews: boolean; provider: string | null } }>) : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setAccess(d.access);
        setRecurring(d.payments.recurring);
        setGatewayRenews(d.payments.autoRenews ? "meio de pagamento" : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The demo has no server account; with the paywall off and nothing bought, there is nothing to show.
  if (!access) return null;
  if (!access.paywall && access.state === "none" && !access.pendingOrder) return null;

  const cancelRenewal = async () => {
    setCancelling("busy");
    try {
      const r = await fetch("/api/me/subscription/cancel", { method: "POST", credentials: "same-origin" });
      if (r.ok) {
        toast.show({ title: "Renovação cancelada", body: "Seu acesso continua até o fim do mês já pago." });
        setAccess((a) => (a?.subscription ? { ...a, subscription: { ...a.subscription, cancelAtPeriodEnd: true, nextChargeAt: null } } : a));
      } else {
        toast.show({ title: "Não foi possível cancelar agora", body: "Nada mudou na sua assinatura. Tente de novo em instantes.", tone: "attention" });
      }
    } catch {
      toast.show({ title: "Sem conexão", body: "Nada mudou na sua assinatura.", tone: "attention" });
    }
    setCancelling("idle");
  };

  const pending = access.pendingOrder;
  const pendingPlan = pending && isPlanId(pending.planId) ? PLANS[pending.planId] : null;
  const sub = access.subscription;

  let title: string;
  let status: { label: string; tone: "mint" | "neutral" | "attention" };
  let detail: React.ReactNode = null;
  let cta: React.ReactNode = null;

  switch (access.state) {
    case "lifetime":
      title = "Plano vitalício";
      status = { label: "Acesso liberado", tone: "mint" };
      detail = (
        <span className="flex items-center gap-2">
          <InfinityIcon className="size-4" aria-hidden /> Pagamento único. Sem mensalidade.
        </span>
      );
      if (access.renewalCancellationPending) detail = <>{detail}<span className="mt-1 block">Estamos encerrando a renovação do seu antigo plano mensal.</span></>;
      break;
    case "monthly":
      title = "Plano mensal";
      status = { label: sub?.status === "past_due" ? "Pagamento pendente" : "Ativo", tone: sub?.status === "past_due" ? "attention" : "mint" };
      detail = (
        <span className="flex flex-col gap-1">
          {access.validUntil && (
            <span className="flex items-center gap-2">
              <CalendarClock className="size-4" aria-hidden /> Acesso válido até {date(access.validUntil)}
            </span>
          )}
          {sub?.nextChargeAt && (
            <span className="flex items-center gap-2">
              <Clock3 className="size-4" aria-hidden /> Próxima cobrança em {date(sub.nextChargeAt)}
            </span>
          )}
          {sub?.cancelAtPeriodEnd && <span>Renovação cancelada — o acesso termina na data acima.</span>}
          {!sub &&
            (gatewayRenews ? (
              <span>Renovação automática todo mês pela {gatewayRenews}. A data acima avança a cada pagamento confirmado.</span>
            ) : (
              <span>Cada pagamento libera um mês. Não há débito automático.</span>
            ))}
        </span>
      );
      cta = (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!pending && <CtaLink href={`${CHECKOUT_ROUTE}?plano=vitalicio`} label="Mudar para o vitalício" />}
          {sub && sub.status !== "cancelled" && !sub.cancelAtPeriodEnd && recurring && (
            cancelling === "confirm" ? (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="danger" onClick={cancelRenewal}>
                  Confirmar cancelamento
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCancelling("idle")}>
                  Manter
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" disabled={cancelling === "busy"} onClick={() => setCancelling("confirm")}>
                {cancelling === "busy" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Cancelar renovação
              </Button>
            )
          )}
        </div>
      );
      break;
    case "granted":
      title = "Acesso liberado";
      status = { label: "Ativo", tone: "mint" };
      detail = "Seu acesso foi liberado pela equipe Lastro.";
      break;
    case "expired":
      title = "Seu acesso mensal terminou";
      status = { label: "Encerrado", tone: "neutral" };
      detail = "Seus dados continuam guardados. Renove para voltar a usar todos os recursos.";
      cta = !pending && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <CtaLink href={`${CHECKOUT_ROUTE}?plano=mensal`} label="Renovar o mensal" />
          <CtaLink href={`${CHECKOUT_ROUTE}?plano=vitalicio`} label="Contratar o vitalício" secondary />
        </div>
      );
      break;
    default:
      title = "Você ainda não tem um plano ativo.";
      status = { label: "Sem plano", tone: "neutral" };
      detail = "Os dois planos liberam todos os recursos do Lastro.";
      cta = !pending && <CtaLink href={CHECKOUT_ROUTE} label="Liberar meu acesso" />;
  }

  return (
    <section aria-labelledby="plan-title" className="mb-8">
      <h2 className="eyebrow mb-3 px-2 text-ink-500">Seu plano</h2>
      <div className={cn("rounded-[32px] p-5 sm:p-6", access.state === "lifetime" ? "surface-hero text-white" : "surface-light")}>
        <div className="flex items-start justify-between gap-3">
          <p id="plan-title" className={cn("flex items-center gap-2 font-display text-[22px] leading-tight font-semibold tracking-[-0.025em]", access.state === "lifetime" ? "text-white" : "text-ink-900")}>
            {access.state === "lifetime" && <Sparkles className="size-5 text-mint" aria-hidden />}
            {title}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[12px] font-bold",
              status.tone === "mint" ? "bg-mint text-midnight" : status.tone === "attention" ? "bg-amber/20 text-amber-ink" : "bg-ink-900/[0.06] text-ink-700",
            )}
          >
            {status.label}
          </span>
        </div>
        {detail && <div className={cn("mt-2 text-[14px] leading-relaxed", access.state === "lifetime" ? "text-white/85" : "text-ink-500")}>{detail}</div>}
        {pending && (
          <Link
            href={`${CHECKOUT_ROUTE}?pedido=${pending.id}`}
            className="mt-4 flex items-center gap-3 rounded-[22px] bg-electric/[0.08] px-4 py-3 text-[14px] text-ink-700 transition-colors hover:bg-electric/[0.12]"
          >
            <Clock3 className="size-4 shrink-0 text-electric" aria-hidden />
            <span className="flex-1">
              <span className="font-semibold text-ink-900">Pagamento em andamento</span>
              {pendingPlan ? ` · ${pendingPlan.name}${pending.method ? ` via ${pending.method === "pix" ? "Pix" : "cartão"}` : ""}` : ""}
            </span>
            <span className="font-semibold text-electric">Acompanhar</span>
          </Link>
        )}
        {cta && <div className="mt-5">{cta}</div>}
      </div>
    </section>
  );
}

function CtaLink({ href, label, secondary }: { href: string; label: string; secondary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-transform active:scale-[0.97]",
        secondary ? "bg-white text-ink-900 shadow-[0_8px_20px_-12px_rgba(22,80,180,0.5)]" : "bg-midnight text-white shadow-[0_12px_26px_-12px_rgba(7,26,59,0.8)]",
      )}
    >
      {label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
