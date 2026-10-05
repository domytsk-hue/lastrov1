"use client";

import { BookOpen, Plus, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { evaluate } from "@/lib/calculator";
import { categoryAverage, reserveStatus } from "@/lib/finance";
import { formatMonthYear, formatNumber, formatRelativeDay } from "@/lib/format";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { ReserveDays } from "@/components/reserve/ReserveDays";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { Button, Field, PageHeader, Segmented, inputClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function ReserveScreen() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const [settings, setSettings] = useState(false);
  const r = useMemo(() => reserveStatus(state, today), [state, today]);
  const lesson = state.lessons.find((l) => l.id === "reserva-ideal");

  return (
    <>
      <PageHeader
        eyebrow="Planejar"
        title="Reserva de emergência"
        action={
          <button onClick={() => setSettings(true)} className="pressable grid size-10 place-items-center rounded-full bg-white/[0.06] text-soft hover:text-off" aria-label="Ajustar meta da reserva">
            <Settings2 className="size-[18px]" />
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="card-raised relative overflow-hidden p-5 sm:p-7 lg:col-span-7">
          <div className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-green/[0.08] blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-2 text-green">
              <ShieldCheck className="size-5" />
              <span className="text-[13px] font-semibold">{formatNumber(r.months, 1)} meses protegidos</span>
            </div>
            <MoneyValue value={r.balance} size="hero" cents={false} className="mt-3" />
            <p className="mt-4 max-w-md font-display text-[20px] leading-snug font-medium tracking-[-0.015em] text-off">
              Hoje, sua reserva cobriria cerca de <span className="text-green">{r.days} dias</span> do seu estilo de vida atual.
            </p>
            <div className="mt-7">
              <ReserveDays days={r.days} targetMonths={state.reserve.targetMonths} />
            </div>
            <p className="mt-4 text-[13px] text-muted">
              Cada ponto é um dia de tranquilidade, com base no custo essencial de <Money value={state.reserve.monthlyCost} />/mês.
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <dl className="card grid grid-cols-2 gap-px overflow-hidden bg-white/[0.06] p-0">
            {[
              ["Meta", <Money key="t" value={r.target} />, `${state.reserve.targetMonths} meses`],
              ["Faltam", <Money key="f" value={r.remaining} />, `${Math.max(0, r.targetDays - r.days)} dias`],
              ["Ritmo atual", r.monthlyPace > 0 ? <><Money key="p" value={r.monthlyPace} />/mês</> : "—", "média de 3 meses"],
              ["Chega lá em", r.remaining === 0 ? "Completa" : r.eta ? formatMonthYear(r.eta) : "—", r.eta ? "no seu ritmo" : "defina um ritmo"],
            ].map(([label, value, hint]) => (
              <div key={label as string} className="bg-surface-1 p-4">
                <dt className="text-[12px] text-muted">{label}</dt>
                <dd className="mt-1 text-[17px] font-semibold first-letter:uppercase">{value}</dd>
                <dd className="text-[12px] text-muted">{hint}</dd>
              </div>
            ))}
          </dl>

          <Button size="lg" onClick={() => openComposer({ type: "transfer", toReserve: true })}>
            <Plus className="size-5" /> Guardar na reserva
          </Button>

          {lesson && (
            <Link href="/crescer?aula=reserva-ideal" className="card group flex items-center gap-4 p-4 hover:bg-surface-2">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-purple/20 text-purple-light">
                <BookOpen className="size-5" />
              </span>
              <div>
                <p className="text-[15px] font-medium">{lesson.title}</p>
                <p className="text-[13px] text-muted">
                  Lastro Academy · {lesson.minutes} min{lesson.completed ? " · concluída" : ""}
                </p>
              </div>
            </Link>
          )}

          <section className="card p-2">
            <h2 className="eyebrow px-3 pt-3 pb-1">Últimos aportes</h2>
            <ul>
              {r.contributions.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[14px] text-soft first-letter:uppercase">{formatRelativeDay(t.date, today)}</span>
                  <span className="text-[14px] font-semibold text-green tabular">
                    +<Money value={t.amount} cents />
                  </span>
                </li>
              ))}
              {r.contributions.length === 0 && <li className="px-3 py-4 text-[14px] text-soft">Seu primeiro aporte aparece aqui.</li>}
            </ul>
          </section>
        </div>
      </div>

      <BottomSheet open={settings} onClose={() => setSettings(false)} title="Meta da reserva" description="Quanto custa um mês essencial da sua vida?">
        {settings && <ReserveSettings onDone={() => setSettings(false)} />}
      </BottomSheet>
    </>
  );
}

function ReserveSettings({ onDone }: { onDone: () => void }) {
  const { state, today, dispatch } = useFinance();
  const toast = useToast();
  const [cost, setCost] = useState(formatNumber(state.reserve.monthlyCost, 0));
  const [months, setMonths] = useState(String(state.reserve.targetMonths));
  const essential = useMemo(
    () => (["moradia", "alimentacao", "transporte", "saude", "educacao"] as const).reduce((s, c) => s + categoryAverage(state, c, today), 0),
    [state, today],
  );
  const costValue = evaluate(cost)?.value ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Field label="Custo essencial por mês" hint={`Pela sua média de moradia, alimentação, transporte, saúde e educação: R$ ${formatNumber(essential, 0)}`}>
        <div className="flex gap-2">
          <input className={inputClass} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          <button onClick={() => setCost(formatNumber(Math.round(essential / 50) * 50, 0))} className="pressable h-12 shrink-0 rounded-[14px] bg-white/[0.06] px-3 text-[13px] font-semibold">
            Usar média
          </button>
        </div>
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-soft">Meses de proteção</p>
        <Segmented
          label="Meses de proteção"
          value={months}
          onChange={setMonths}
          options={[
            { value: "3", label: "3 meses" },
            { value: "6", label: "6 meses" },
            { value: "12", label: "12 meses" },
          ]}
        />
        <p className="mt-2 text-[13px] text-muted">CLT costuma precisar de 6 meses. Autônomos, de 12.</p>
      </div>
      <p className="text-[14px] text-soft">
        Nova meta: <span className="font-semibold text-off"><Money value={costValue * Number(months)} /></span>
      </p>
      <Button
        size="lg"
        disabled={costValue <= 0}
        onClick={() => {
          dispatch({ type: "reserve/set", patch: { monthlyCost: costValue, targetMonths: Number(months) } });
          toast.show({ title: "Meta da reserva atualizada" });
          onDone();
        }}
      >
        Salvar
      </Button>
    </div>
  );
}
