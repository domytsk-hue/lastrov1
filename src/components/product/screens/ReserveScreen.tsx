"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { evaluate } from "@/product/domain/calculator";
import { categoryAverage, reserveStatus } from "@/product/domain/finance";
import { formatMonthYear, formatNumber, formatRelativeDay } from "@/lib/format";
import { spring } from "@/design-system/motion";
import { useFinance } from "@/product/store/finance-store";
import { useUI } from "@/product/store/ui-store";
import { ProtectionLayers } from "@/components/shared/data-viz/ProtectionLayers";
import { Money } from "@/components/shared/motion/AnimatedNumber";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { Button, Field, PageHeader, Segmented, inputClass } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";
import { Capsule, FinancialSurface, StoryTitle } from "@/components/shared/surfaces/Surface";
import { ROUTES } from "@/config/routes";

export function ReserveScreen() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const reduce = useReducedMotion();
  const [settings, setSettings] = useState(false);
  const r = useMemo(() => reserveStatus(state, today), [state, today]);
  const lesson = state.lessons.find((l) => l.id === "reserva-ideal");
  const configured = state.reserve.monthlyCost > 0;

  return (
    <>
      <PageHeader
        eyebrow="Sua base de tranquilidade"
        title="Reserva"
        action={
          <button onClick={() => setSettings(true)} className="grid size-12 place-items-center rounded-full bg-white/80 text-ink-700 shadow-[0_8px_20px_-12px_rgba(22,80,180,0.5)] active:scale-95" aria-label="Ajustar meta da reserva">
            <Settings2 className="size-5" />
          </button>
        }
      />

      {/* The emotional moment: months of protection as layers around a center */}
      <section className="grid items-center gap-8 lg:grid-cols-2" aria-label="Proteção atual">
        <div className="flex justify-center">
          <ProtectionLayers months={r.months} target={state.reserve.targetMonths} size={320}>
            <motion.div initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.soft, delay: 0.3 }}>
              <p className="font-display text-[56px] leading-none font-semibold tracking-[-0.05em] text-ink-900">{formatNumber(r.months, 1)}</p>
              <p className="mt-1 text-[13px] font-bold tracking-[0.18em] text-ink-500">MESES</p>
            </motion.div>
          </ProtectionLayers>
        </div>
        <div className="px-1">
          {configured ? (
            <>
              <p className="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink-900 sm:text-[42px]">
                {r.days} dias de tranquilidade financeira.
              </p>
              <p className="mt-3 text-[17px] text-ink-700">
                <Money value={r.balance} /> guardados · cada anel é um mês do seu custo essencial.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Capsule tone="white">
                  Meta: {state.reserve.targetMonths} meses · <Money value={r.target} />
                </Capsule>
                {r.remaining > 0 && (
                  <Capsule tone="white">
                    Faltam <Money value={r.remaining} />
                  </Capsule>
                )}
                {r.eta && r.remaining > 0 && <Capsule tone="mint">Completa em {formatMonthYear(r.eta)}</Capsule>}
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-ink-900">Quanto custa um mês essencial da sua vida?</p>
              <p className="mt-3 text-[17px] text-ink-700">Com esse número, o Lastro mostra quantos dias sua reserva protege.</p>
              <Button className="mt-6" onClick={() => setSettings(true)}>
                Definir custo essencial
              </Button>
            </>
          )}
          <Button variant="mint" size="lg" className="mt-8 w-full sm:w-auto" onClick={() => openComposer({ type: "transfer", toReserve: true })}>
            <Plus className="size-5" /> Guardar na reserva
          </Button>
        </div>
      </section>

      <div className="mt-14 grid gap-8 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-labelledby="contrib-title">
          <StoryTitle id="contrib-title" title="Últimos aportes" kicker={r.monthlyPace > 0 ? `Ritmo de ${formatNumber(r.monthlyPace, 0)} reais por mês` : undefined} />
          <ul className="flex flex-col gap-2">
            {r.contributions.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-[24px] bg-white/80 px-5 py-4">
                <span className="text-[16px] font-medium text-ink-700 first-letter:uppercase">{formatRelativeDay(t.date, today)}</span>
                <span className="font-display text-[18px] font-semibold text-mint-ink tabular">
                  +<Money value={t.amount} cents />
                </span>
              </li>
            ))}
            {r.contributions.length === 0 && <li className="rounded-[24px] bg-white/60 px-5 py-6 text-[15px] text-ink-500">Seu primeiro aporte aparece aqui.</li>}
          </ul>
        </section>
        {lesson && (
          <FinancialSurface tone="navy" radius="organicR" interactive className="self-start lg:col-span-5 lg:mt-14">
            <Link href={`${ROUTES.crescer}?aula=reserva-ideal`} className="block p-6">
              <span className="grid size-12 place-items-center rounded-full bg-white/12 text-mint">
                <BookOpen className="size-5" />
              </span>
              <p className="mt-5 font-display text-[24px] leading-tight font-semibold">{lesson.title}</p>
              <p className="mt-2 text-[15px] text-white/65">
                Aula de {lesson.minutes} min{lesson.completed ? " · concluída" : " · termina com a sua conta"}
              </p>
            </Link>
          </FinancialSurface>
        )}
      </div>

      <BottomSheet open={settings} onClose={() => setSettings(false)} title="Meta da reserva" description="Quanto custa um mês essencial?">
        {settings && <ReserveSettings onDone={() => setSettings(false)} />}
      </BottomSheet>
    </>
  );
}

function ReserveSettings({ onDone }: { onDone: () => void }) {
  const { state, today, dispatch } = useFinance();
  const toast = useToast();
  const [cost, setCost] = useState(state.reserve.monthlyCost ? formatNumber(state.reserve.monthlyCost, 0) : "");
  const [months, setMonths] = useState(String(state.reserve.targetMonths));
  const essential = useMemo(() => (["moradia", "alimentacao", "transporte", "saude", "educacao"] as const).reduce((s, c) => s + categoryAverage(state, c, today), 0), [state, today]);
  const costValue = evaluate(cost)?.value ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Custo essencial por mês" hint={essential > 0 ? `Pela sua média de moradia, alimentação, transporte, saúde e educação: R$ ${formatNumber(essential, 0)}` : undefined}>
        <div className="flex gap-2">
          <input className={inputClass} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="R$ 4.000" />
          {essential > 0 && (
            <button onClick={() => setCost(formatNumber(Math.round(essential / 50) * 50, 0))} className="h-13 shrink-0 rounded-full bg-midnight px-4 text-[14px] font-semibold text-white active:scale-95">
              Usar média
            </button>
          )}
        </div>
      </Field>
      <div>
        <p className="mb-2 text-[14px] font-semibold text-ink-700">Meses de proteção</p>
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
        <p className="mt-2 text-[14px] text-ink-500">CLT costuma precisar de 6. Autônomos, de 12.</p>
      </div>
      <p className="text-[16px] text-ink-700">
        Nova meta: <strong className="font-semibold text-ink-900"><Money value={costValue * Number(months)} /></strong>
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
