"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Gauge, Pencil, ShieldCheck, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { evaluate } from "@/product/domain/calculator";
import { allBudgets, goalStatus, monthSummary, projectMonth, reserveStatus } from "@/product/domain/finance";
import { capitalize, formatMonthYear, formatNumber } from "@/lib/format";
import { spring } from "@/design-system/motion";
import { useFinance } from "@/product/store/finance-store";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { Button, Field, PageHeader, inputClass } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";
import { ROUTES } from "@/config/routes";

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
      { key: "ess", label: "Essenciais", hint: "Casa, mercado, transporte, saúde", planned: sumL(essentials), actual: sumS(essentials), color: "#173D91" },
      { key: "life", label: "Estilo de vida", hint: "Lazer, compras e o resto", planned: sumL(lifestyle), actual: sumS(lifestyle), color: "#3678F5" },
      { key: "goals", label: "Metas e reserva", hint: "O que você está construindo", planned: state.plan.goals, actual: ms.saved, color: "#65B7F2" },
      { key: "inv", label: "Investimentos", hint: "Patrimônio de longo prazo", planned: state.plan.investments, actual: ms.invested, color: "#8CCBFF" },
    ];
    const allocated = steps.reduce((s, x) => s + x.planned, 0);
    return { income, steps, free: income - allocated };
  }, [state, today]);

  const proj = useMemo(() => projectMonth(state, today), [state, today]);
  const r = reserveStatus(state, today);
  const base = Math.max(plan.income, plan.steps.reduce((s, x) => s + x.planned, 0), 1);
  const future = plan.steps[2].planned + plan.steps[3].planned;

  return (
    <>
      <PageHeader
        eyebrow={capitalize(formatMonthYear(today))}
        title="Plano do mês"
        action={
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Ajustar
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-12">
        {/* The river: where each real of the month goes */}
        <FinancialSurface tone="hero" radius="xl" className="p-6 sm:p-8 lg:col-span-7">
          <p className="text-[16px] font-medium text-white/80">Entram por mês</p>
          <AnimatedMoney value={plan.income} size="display" cents={false} className="mt-1 text-white" />
          {plan.income <= 0 ? (
            <div className="mt-6">
              <p className="text-[17px] text-white/90">Comece pela sua renda. O Lastro desenha para onde vai cada real.</p>
              <Button variant="mint" className="mt-4" onClick={() => setEditing(true)}>
                Informar renda
              </Button>
            </div>
          ) : (
            <ol className="relative mt-8 flex flex-col gap-3">
              <span className="absolute top-2 bottom-2 left-[19px] w-[2px] rounded-full bg-white/25" aria-hidden />
              {plan.steps.map((s, i) => (
                <motion.li key={s.key} className="relative flex items-center gap-4" initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: 0.1 + i * 0.08 }}>
                  <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-white/90 text-[13px] font-bold text-midnight">{Math.round((s.planned / plan.income) * 100)}%</span>
                  <div className="surface-glass min-w-0 flex-1 overflow-hidden rounded-[22px] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[16px] font-semibold">{s.label}</p>
                      <p className="font-display text-[18px] font-semibold tabular">
                        <Money value={s.planned} />
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                      <motion.div className="h-full origin-left rounded-full bg-white" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: s.planned ? Math.min(1, s.actual / s.planned) : 0 }} transition={{ ...spring.soft, delay: 0.3 + i * 0.08 }} />
                    </div>
                    <p className="mt-1.5 text-[13px] text-white/70">
                      <Money value={s.actual} /> até agora
                    </p>
                  </div>
                </motion.li>
              ))}
              <li className="relative flex items-center gap-4">
                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-mint text-[13px] font-bold text-midnight">{Math.round((Math.max(0, plan.free) / base) * 100)}%</span>
                <div className="flex flex-1 items-baseline justify-between rounded-[22px] bg-mint/90 px-4 py-3 text-midnight">
                  <p className="text-[16px] font-semibold">Livre</p>
                  <p className="font-display text-[20px] font-semibold tabular">
                    <Money value={plan.free} />
                  </p>
                </div>
              </li>
            </ol>
          )}
        </FinancialSurface>

        <div className="flex flex-col gap-6 lg:col-span-5 lg:pt-10">
          <div className="px-1">
            <p className="font-display text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink-900">
              {proj.free >= 0 ? (
                <>
                  Neste ritmo, sobram cerca de <span className="text-mint-ink"><Money value={Math.round(proj.free / 10) * 10} /></span>.
                </>
              ) : (
                <>
                  Neste ritmo, o mês fecha <Money value={-proj.free} /> acima do plano.
                </>
              )}
            </p>
            {plan.income > 0 && (
              <p className="mt-3 text-[16px] text-ink-700">
                Você direciona {Math.round((future / plan.income) * 100)}% da renda para o futuro.
              </p>
            )}
          </div>
          <HubCard href={ROUTES.orcamentos} icon={<Gauge className="size-5" />} title="Orçamentos" body={`${allBudgets(state, today).filter((b) => b.state === "healthy").length} de ${state.budgets.length} no ritmo`} />
          <HubCard
            href={ROUTES.metas}
            icon={<Target className="size-5" />}
            title="Metas"
            body={state.goals.length ? `${state.goals[0].name}: ${Math.round(goalStatus(state, state.goals[0], today).progress * 100)}%` : "Crie sua primeira meta"}
            right
          />
          <HubCard href={ROUTES.reserva} icon={<ShieldCheck className="size-5" />} title="Reserva" body={`${r.days} dias protegidos`} />
        </div>
      </div>

      <BottomSheet open={editing} onClose={() => setEditing(false)} title="Ajustar plano" description="Quanto entra e quanto vai para o futuro.">
        {editing && <PlanForm onDone={() => setEditing(false)} />}
      </BottomSheet>
    </>
  );
}

function HubCard({ href, icon, title, body, right }: { href: string; icon: React.ReactNode; title: string; body: string; right?: boolean }) {
  return (
    <FinancialSurface tone="light" radius={right ? "organicR" : "organic"} interactive>
      <Link href={href} className="group flex items-center gap-4 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-midnight text-white">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] font-semibold">{title}</p>
          <p className="truncate text-[15px] text-ink-500">{body}</p>
        </div>
        <ArrowRight className="size-5 text-ink-400 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </FinancialSurface>
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
        <p className="text-[15px] text-ink-500">
          Você direciona <span className="font-semibold text-mint-ink">{formatNumber(((v(goals) + v(inv)) / v(income)) * 100, 0)}%</span> da renda para o futuro.
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
