"use client";

import { useState } from "react";
import { evaluate } from "@/product/domain/calculator";
import { cn } from "@/lib/cn";
import { addMonths, diffInDays, formatMonthYear, formatNumber } from "@/lib/format";
import type { Goal, GoalKind } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { Button, Field, inputClass } from "@/components/shared/ui/primitives";
import { useToast } from "@/components/shared/ui/Toast";
import { GOAL_KINDS, goalKind } from "./goal-kinds";

export function GoalSheet({ open, goal, onClose }: { open: boolean; goal?: Goal; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={goal ? "Editar meta" : "Nova meta"} description={goal ? undefined : "O que você quer conquistar?"}>
      {open && <GoalForm key={goal?.id ?? "new"} goal={goal} onDone={onClose} />}
    </BottomSheet>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { today, dispatch } = useFinance();
  const toast = useToast();
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "trip");
  const [name, setName] = useState(goal?.name ?? goalKind("trip").name);
  const [nameTouched, setNameTouched] = useState(!!goal);
  const [target, setTarget] = useState(goal ? formatNumber(goal.target, 0) : "");
  const [date, setDate] = useState(goal?.targetDate ?? addMonths(today, 12));
  const [monthly, setMonthly] = useState(goal?.monthlyContribution ? formatNumber(goal.monthlyContribution, 0) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const targetValue = evaluate(target)?.value ?? 0;
  const monthlyValue = evaluate(monthly)?.value ?? 0;
  const months = Math.max(1, Math.round(diffInDays(date, today) / 30.4));
  const suggestedMonthly = targetValue > 0 ? Math.ceil(targetValue / months / 10) * 10 : 0;

  const save = () => {
    const color = goal?.color ?? goalKind(kind).color;
    const data = {
      name: name.trim() || goalKind(kind).label,
      kind,
      target: targetValue,
      targetDate: date || undefined,
      monthlyContribution: monthlyValue || undefined,
      color,
    };
    if (goal) dispatch({ type: "goal/update", id: goal.id, patch: data });
    else dispatch({ type: "goal/add", goal: { ...data, initialSaved: 0, createdAt: today } });
    toast.show({ title: goal ? "Meta atualizada" : `${data.name} criada`, body: monthlyValue ? `Guardando R$ ${formatNumber(monthlyValue, 0)}/mês, você chega em ${formatMonthYear(addMonths(today, Math.ceil(targetValue / monthlyValue)))}.` : undefined });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      {!goal && (
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de meta">
          {GOAL_KINDS.map((k) => (
            <button
              key={k.kind}
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => {
                setKind(k.kind);
                if (!nameTouched) setName(k.name);
              }}
              className={cn("flex flex-col items-center gap-1.5 rounded-[22px] py-3 text-[13px] font-semibold transition-transform active:scale-95", kind === k.kind ? "bg-midnight text-white" : "bg-white text-ink-700 shadow-[0_6px_16px_-12px_rgba(22,80,180,0.5)]")}
            >
              <k.icon className="size-5" style={{ color: k.color }} />
              {k.label}
            </button>
          ))}
        </div>
      )}
      <Field label="Nome">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder="Ex.: Viagem Japão"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quanto custa">
          <input className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="R$ 15.000" />
        </Field>
        <Field label="Até quando">
          <input type="date" className={cn(inputClass, "px-3")} value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Aporte mensal automático" hint={suggestedMonthly ? `Para chegar no prazo: cerca de R$ ${formatNumber(suggestedMonthly, 0)}/mês` : undefined}>
        <div className="flex gap-2">
          <input className={inputClass} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="R$ 600" />
          {suggestedMonthly > 0 && (
            <button onClick={() => setMonthly(formatNumber(suggestedMonthly, 0))} className="h-13 shrink-0 rounded-full bg-midnight px-4 text-[14px] font-semibold text-white active:scale-95">
              Usar sugestão
            </button>
          )}
        </div>
      </Field>
      <Button size="lg" disabled={targetValue <= 0} onClick={save}>
        {goal ? "Salvar meta" : "Criar meta"}
      </Button>
      {goal &&
        (confirmDelete ? (
          <div className="flex items-center justify-between gap-3 rounded-[22px] bg-rose/10 p-4">
            <p className="text-[14px] text-ink-900">O histórico de aportes fica salvo. Excluir mesmo?</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                dispatch({ type: "goal/delete", id: goal.id });
                toast.show({ title: `${goal.name} removida`, tone: "neutral" });
                onDone();
              }}
            >
              Excluir
            </Button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-[14px] font-semibold text-ink-500 hover:text-rose-ink">
            Excluir meta
          </button>
        ))}
    </div>
  );
}
