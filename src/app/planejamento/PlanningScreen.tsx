"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Gauge, Pencil, ShieldCheck, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getCategory } from "@/data/categories";
import { evaluate } from "@/lib/calculator";
import { allBudgets, goalStatus, monthSummary, projectMonth, reserveStatus } from "@/lib/finance";
import { capitalize, formatMonthYear, formatNumber } from "@/lib/format";
import { useFinance } from "@/store/finance-store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressBar } from "@/components/ui/Progress";
import { Button, Field, PageHeader, inputClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export function PlanningScreen() {
  const { state, today } = useFinance();
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);

  const plan = useMemo(() => {
    const budgets = allBudgets(state, today);
    const ms = monthSummary(state, today);
    const essentials = budgets.filter((b) => b.fixed || ["alimentacao", "transporte", "saude"].includes(b.categoryId));
    const lifestyle = budgets.filter((b) => !essentials.includes(b));
    const sumL = (xs: typeof budgets) => xs.reduce((s, b) => s + b.limit, 0);
    const sumS = (xs: typeof budgets) => xs.reduce((s, b) => s + b.spent, 0);
    const income = state.user.monthlyIncome;
    const steps = [
      { key: "ess", label: "Essenciais", hint: essentials.map((b) => getCategory(b.categoryId).name).join(", "), planned: sumL(essentials), actual: sumS(essentials), color: "#8B6BFF" },
      { key: "life", label: "Estilo de vida", hint: lifestyle.map((b) => getCategory(b.categoryId).name).join(", "), planned: sumL(lifestyle), actual: sumS(lifestyle), color: "#FF8A5B" },
      { key: "goals", label: "Metas e reserva", hint: "Japão, reserva e outras metas", planned: state.plan.goals, actual: ms.saved, color: "#FFC234" },
      { key: "inv", label: "Investimentos", hint: "Aporte mensal", planned: state.plan.investments, actual: ms.invested, color: "#5B8CFF" },
    ];
    const allocated = steps.reduce((s, x) => s + x.planned, 0);
    return { income, steps, free: income - allocated, receivedIncome: ms.income };
  }, [state, today]);

  const proj = useMemo(() => projectMonth(state, today), [state, today]);
  const r = reserveStatus(state, today);
  const flowBase = Math.max(plan.income, plan.steps.reduce((s, x) => s + x.planned, 0));

  return (
    <>
      <PageHeader eyebrow={capitalize(formatMonthYear(today))} title="Plano do mês" action={<Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Ajustar</Button>} />

      {plan.income <= 0 && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[15px] font-semibold">Comece pela sua renda mensal.</p>
            <p className="text-[13px] text-soft">Com ela, o Lastro desenha para onde vai cada real do mês.</p>
          </div>
          <Button size="sm" onClick={() => setEditing(true)}>
            Informar renda
          </Button>
        </div>
      )}
      <section className="card-raised mb-6 p-5 sm:p-7" aria-label="Para onde vai sua renda">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-soft">Renda esperada</p>
            <MoneyValue value={plan.income} size="xl" cents={false} className="mt-1" />
          </div>
          <div className="text-right">
            <p className="text-[13px] text-soft">Dinheiro livre planejado</p>
            <MoneyValue value={plan.free} size="lg" cents={false} className="mt-1" tone={plan.free >= 0 ? "positive" : "negative"} />
          </div>
        </div>

        {/* The flow: income split into where it goes */}
        <div className="mt-6 flex h-14 w-full gap-1 overflow-hidden rounded-[18px]" role="img" aria-label="Divisão da renda">
          {[...plan.steps, { key: "free", label: "Livre", planned: Math.max(0, plan.free), color: "#00D99B" }].map((s, i) =>
            s.planned > 0 ? (
              <motion.div
                key={s.key}
                className="relative flex items-end overflow-hidden p-2"
                style={{ background: `${s.color}${s.key === "free" ? "" : "cc"}` }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(s.planned / flowBase) * 100}%` }}
                transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="truncate text-[11px] font-semibold text-ink/80">{formatNumber((s.planned / plan.income) * 100, 0)}%</span>
              </motion.div>
            ) : null,
          )}
        </div>

        <ol className="mt-6 flex flex-col">
          <li className="flex items-center gap-3 pb-3">
            <span className="size-2.5 rounded-full bg-off" />
            <span className="flex-1 text-[15px] font-semibold">Renda</span>
            <span className="text-[15px] font-semibold tabular">
              <Money value={plan.income} />
            </span>
          </li>
          {plan.steps.map((s) => (
            <li key={s.key} className="relative border-l border-dashed border-white/10 py-3 pl-5 ml-[4.5px]">
              <span className="absolute top-[18px] -left-[5px] size-2.5 rounded-full" style={{ background: s.color }} />
              <div className="flex items-baseline gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{s.label}</p>
                  <p className="truncate text-[12px] text-muted">{s.hint}</p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-semibold tabular">
                    <Money value={s.planned} />
                  </p>
                  <p className="text-[12px] text-muted tabular">
                    <Money value={s.actual} /> até agora
                  </p>
                </div>
              </div>
              <ProgressBar value={s.planned ? s.actual / s.planned : 0} color={s.color} height={4} className="mt-2" />
            </li>
          ))}
          <li className="relative ml-[4.5px] border-l border-dashed border-white/10 pt-3 pl-5">
            <span className="absolute top-[18px] -left-[5px] size-2.5 rounded-full bg-green" />
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-semibold text-green">Livre</p>
              <p className="text-[15px] font-semibold text-green tabular">
                <Money value={plan.free} />
              </p>
            </div>
          </li>
        </ol>

        <p className="mt-6 rounded-[18px] bg-white/[0.04] p-4 text-[14px] leading-snug text-soft">
          {proj.free >= 0 ? (
            <>
              Neste ritmo, você termina o mês com cerca de <span className="font-semibold text-off"><Money value={Math.round(proj.free / 10) * 10} /></span> livres, já com metas e aportes feitos.
            </>
          ) : (
            <>
              Neste ritmo, o mês fecha <span className="font-semibold text-off"><Money value={-proj.free} /></span> acima do plano. As categorias de estilo de vida são as mais fáceis de ajustar.
            </>
          )}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <HubCard href="/orcamentos" icon={<Gauge className="size-5" />} color="#8B6BFF" title="Orçamentos" body={`${allBudgets(state, today).filter((b) => b.state === "healthy").length} de ${state.budgets.length} categorias saudáveis`} />
        <HubCard
          href="/metas"
          icon={<Target className="size-5" />}
          color="#FFC234"
          title="Metas"
          body={state.goals.length ? `${state.goals[0].name}: ${Math.round(goalStatus(state, state.goals[0], today).progress * 100)}%` : "Crie sua primeira meta"}
        />
        <HubCard href="/reserva" icon={<ShieldCheck className="size-5" />} color="#00D99B" title="Reserva" body={`${r.days} dias protegidos`} />
      </div>

      <BottomSheet open={editing} onClose={() => setEditing(false)} title="Ajustar plano" description="Quanto entra e quanto vai para o futuro.">
        {editing && <PlanForm onDone={() => setEditing(false)} />}
      </BottomSheet>
    </>
  );
}

function HubCard({ href, icon, color, title, body }: { href: string; icon: React.ReactNode; color: string; title: string; body: string }) {
  return (
    <Link href={href} className="card pressable group flex items-center gap-4 p-5 hover:bg-surface-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: `${color}1f`, color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold">{title}</p>
        <p className="truncate text-[13px] text-soft">{body}</p>
      </div>
      <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-off" />
    </Link>
  );
}

function PlanForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useFinance();
  const toast = useToast();
  const [income, setIncome] = useState(formatNumber(state.user.monthlyIncome, 0));
  const [goals, setGoals] = useState(formatNumber(state.plan.goals, 0));
  const [inv, setInv] = useState(formatNumber(state.plan.investments, 0));
  const v = (s: string) => evaluate(s)?.value ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Renda mensal">
        <input className={inputClass} inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Para metas e reserva">
          <input className={inputClass} inputMode="decimal" value={goals} onChange={(e) => setGoals(e.target.value)} />
        </Field>
        <Field label="Para investir">
          <input className={inputClass} inputMode="decimal" value={inv} onChange={(e) => setInv(e.target.value)} />
        </Field>
      </div>
      {v(income) > 0 && (
        <p className="text-[14px] text-soft">
          Você direciona <span className="font-semibold text-green">{formatNumber(((v(goals) + v(inv)) / v(income)) * 100, 0)}%</span> da renda para o futuro.
        </p>
      )}
      <Button
        size="lg"
        disabled={v(income) <= 0}
        onClick={() => {
          dispatch({ type: "user/set", patch: { monthlyIncome: v(income) } });
          dispatch({ type: "plan/set", plan: { goals: v(goals), investments: v(inv) } });
          toast.show({ title: "Plano atualizado" });
          onDone();
        }}
      >
        Salvar plano
      </Button>
    </div>
  );
}
