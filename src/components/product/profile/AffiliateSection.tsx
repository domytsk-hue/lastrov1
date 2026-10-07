"use client";

import { Copy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatBRL, formatNumber } from "@/lib/format";
import { Button } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";

interface Stats {
  visits: number;
  unique_visitors: number;
  signups: number;
  purchases: number;
  conversion_rate: number | null;
  revenue_generated_minor: number;
  commission_generated_minor: number | null;
  pending_commission_minor: number | null;
  paid_commission_minor: number | null;
}

interface MyAffiliate {
  code: string;
  link: string;
  stats: Stats;
}

const money = (minor: number) => formatBRL(minor / 100);

/**
 * "Programa de afiliados" — only for active affiliates. For everyone else this renders
 * nothing: no placeholder, no locked state, no invitation. Data comes from Lastro's own API
 * (local database), never from Centralis at render time.
 */
export function AffiliateSection({ enabled }: { enabled: boolean }) {
  const [me, setMe] = useState<MyAffiliate | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/me/affiliate", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ affiliate: MyAffiliate | null }>) : null))
      .then((d) => alive && setMe(d?.affiliate ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!me) return null;
  const s = me.stats;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.link);
      toast.show({ title: "Link copiado", body: "Compartilhe para começar a indicar." });
    } catch {
      toast.show({ title: "Não deu para copiar", body: me.link, tone: "attention", duration: 7000 });
    }
  };

  const metrics: { label: string; value: string }[] = [
    { label: "Visitas", value: formatNumber(s.visits, 0) },
    { label: "Compras", value: formatNumber(s.purchases, 0) },
  ];
  if (s.unique_visitors > 0) metrics.push({ label: "Visitantes únicos", value: formatNumber(s.unique_visitors, 0) });
  if (s.signups > 0) metrics.push({ label: "Cadastros", value: formatNumber(s.signups, 0) });
  if (s.conversion_rate !== null) metrics.push({ label: "Conversão", value: `${formatNumber(s.conversion_rate * 100, 2)}%` });
  if (s.revenue_generated_minor > 0) metrics.push({ label: "Receita gerada", value: money(s.revenue_generated_minor) });
  if (s.commission_generated_minor !== null) metrics.push({ label: "Comissão", value: money(s.commission_generated_minor) });
  if (s.pending_commission_minor !== null) metrics.push({ label: "A receber", value: money(s.pending_commission_minor) });
  if (s.paid_commission_minor !== null) metrics.push({ label: "Já recebido", value: money(s.paid_commission_minor) });

  return (
    <section aria-labelledby="affiliate-title" className="mb-8">
      <h2 id="affiliate-title" className="eyebrow mb-3 px-2 text-ink-500">
        Programa de afiliados
      </h2>
      <div className="surface-light rounded-[36px] p-5 sm:p-6">
        <p className="text-[14px] font-medium text-ink-500">Seu link</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-4 py-3 text-[15px] font-semibold text-ink-900 shadow-[inset_0_0_0_1px_rgba(7,26,59,0.06)]">
            <Link2 className="size-[18px] shrink-0 text-electric" aria-hidden />
            <span className="truncate" title={me.link}>
              {me.link}
            </span>
          </p>
          <Button onClick={copy} className="shrink-0">
            <Copy className="size-4" aria-hidden />
            Copiar link
          </Button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-[24px] bg-white/80 p-4">
              <dt className="text-[13px] font-medium text-ink-500">{m.label}</dt>
              <dd className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-[-0.03em] text-ink-900 tabular-nums">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
