"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, getCategory } from "@/data/categories";
import { allBudgets, categoryAverage, type BudgetStatus } from "@/lib/finance";
import { capitalize, formatMonthYear, formatNumber, parseISODate } from "@/lib/format";
import { evaluate } from "@/lib/calculator";
import type { BudgetState, CategoryId } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { BudgetCard, budgetAdvice } from "@/components/budgets/BudgetCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CategoryChip, Button, EmptyState, Field, PageHeader, STATE_COLOR, inputClass } from "@/components/ui/primitives";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { ProgressRing } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";

const ORDER: Record<BudgetState, number> = { exceeded: 0, critical: 1, attention: 2, healthy: 3 };

export function BudgetsScreen() {
  const { state, today } = useFinance();
  const [editing, setEditing] = useState<CategoryId | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => allBudgets(state, today), [state, today]);

  const sorted = [...list].sort((a, b) => ORDER[a.state] - ORDER[b.state] || Number(a.fixed) - Number(b.fixed) || b.pct - a.pct);
  const totalLimit = list.reduce((s, b) => s + b.limit, 0);
  const totalSpent = list.reduce((s, b) => s + b.spent, 0);
  const variable = list.filter((b) => !b.fixed);
  const freeVariable = variable.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  const daily = variable.reduce((s, b) => s + b.dailyAllowance, 0);
  const counts = (["healthy", "attention", "critical", "exceeded"] as BudgetState[]).map((s) => [s, list.filter((b) => b.state === s).length] as const);
  const unbudgeted = EXPENSE_CATEGORIES.filter((c) => !state.budgets.some((b) => b.categoryId === c.id));
  const daysLeft = list[0]?.daysLeft ?? 0;

  return (
    <>
      <PageHeader eyebrow={capitalize(formatMonthYear(today))} title="Orçamentos" />

      {list.length === 0 ? (
        <section className="card mb-6">
          <EmptyState
            title="Orçamento sem planilha."
            body="Escolha uma categoria e um limite. O Lastro mostra quanto dá para gastar por dia e avisa com calma quando algo pede atenção."
            action={<Button onClick={() => setAdding(true)}>Criar primeiro orçamento</Button>}
          />
        </section>
      ) : (
      <section className="card-raised mb-6 grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex items-center gap-5">
          <ProgressRing value={totalLimit ? totalSpent / totalLimit : 0} size={96} stroke={8} color="var(--color-purple-light)">
            <div className="text-center">
              <p className="font-display text-[22px] leading-none font-semibold tabular">{Math.round((totalSpent / Math.max(1, totalLimit)) * 100)}%</p>
              <p className="mt-0.5 text-[10px] text-muted uppercase">usado</p>
            </div>
          </ProgressRing>
          <div>
            <p className="text-[13px] text-soft">Gasto no mês</p>
            <MoneyValue value={totalSpent} size="lg" cents={false} className="mt-1" />
            <p className="mt-1 text-[13px] text-muted">
              de <Money value={totalLimit} /> planejados
            </p>
          </div>
        </div>
        <div className="rounded-[20px] bg-white/[0.04] p-4">
          <p className="text-[14px] leading-snug text-off">
            Ainda há <strong className="font-semibold"><Money value={freeVariable} /></strong> para o dia a dia nos próximos {daysLeft} dias.
          </p>
          <p className="mt-1 text-[13px] text-soft">
            Isso dá cerca de <span className="font-semibold text-green"><Money value={daily} />/dia</span>.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:flex-col" aria-label="Estado das categorias">
          {counts
            .filter(([, n]) => n > 0)
            .map(([s, n]) => (
              <li key={s} className="flex items-center gap-2 text-[13px] text-soft">
                <span className="size-2 rounded-full" style={{ background: STATE_COLOR[s] }} />
                {n} {labelFor(s, n)}
              </li>
            ))}
        </ul>
      </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((b) => (
          <BudgetCard key={b.categoryId} b={b} onClick={() => setEditing(b.categoryId)} />
        ))}
        {unbudgeted.length > 0 && list.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="pressable flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-white/10 text-soft hover:border-white/20 hover:text-off"
          >
            <Plus className="size-6" />
            <span className="text-[14px] font-medium">Novo orçamento</span>
          </button>
        )}
      </div>

      <BudgetSheet categoryId={editing} onClose={() => setEditing(null)} status={list.find((b) => b.categoryId === editing)} />
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Novo orçamento" description="Escolha uma categoria para acompanhar.">
        <div className="flex flex-wrap gap-2">
          {unbudgeted.map((c) => (
            <CategoryChip
              key={c.id}
              id={c.id}
              onClick={() => {
                setAdding(false);
                setEditing(c.id);
              }}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

function labelFor(s: BudgetState, n: number) {
  const plural = n > 1;
  return { healthy: plural ? "saudáveis" : "saudável", attention: "em atenção", critical: plural ? "críticas" : "crítica", exceeded: plural ? "excedidas" : "excedida" }[s];
}

function BudgetSheet({ categoryId, status, onClose }: { categoryId: CategoryId | null; status?: BudgetStatus; onClose: () => void }) {
  return (
    <BottomSheet open={!!categoryId} onClose={onClose} title={categoryId ? getCategory(categoryId).name : ""} description={status ? "Ajuste o limite do mês." : "Defina quanto quer gastar por mês."}>
      {categoryId && <BudgetForm key={categoryId} categoryId={categoryId} status={status} onDone={onClose} />}
    </BottomSheet>
  );
}

function BudgetForm({ categoryId, status, onDone }: { categoryId: CategoryId; status?: BudgetStatus; onDone: () => void }) {
  const { state, today, dispatch } = useFinance();
  const { openComposer } = useUI();
  const toast = useToast();
  const avg = useMemo(() => categoryAverage(state, categoryId, today), [state, categoryId, today]);
  const [value, setValue] = useState(status ? formatNumber(status.limit, 0) : avg > 0 ? formatNumber(Math.ceil(avg / 50) * 50, 0) : "");
  const limit = evaluate(value)?.value ?? 0;
  const suggestions = [Math.ceil((avg * 0.9) / 10) * 10, Math.ceil(avg / 50) * 50, Math.ceil((avg * 1.15) / 50) * 50].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const name = getCategory(categoryId).name;

  const dim = new Date(parseISODate(today).getFullYear(), parseISODate(today).getMonth() + 1, 0).getDate();
  const previewDaily = status && !status.fixed ? Math.max(0, limit - status.spent) / status.daysLeft : limit / dim;

  return (
    <div className="flex flex-col gap-5">
      {status && <div className="rounded-[18px] bg-white/[0.04] p-4 text-[14px] leading-snug text-soft">{budgetAdvice(status)}</div>}
      <Field label="Limite mensal" hint={avg > 0 ? `Sua média nos últimos 3 meses: ${formatNumber(avg, 0)} reais` : undefined}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-muted">R$</span>
          <input autoFocus inputMode="decimal" className={`${inputClass} h-14 pl-11 font-display text-[22px] font-semibold`} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </Field>
      {suggestions.length > 0 && (
        <div className="flex gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setValue(formatNumber(s, 0))} className="pressable h-9 rounded-full bg-white/[0.05] px-3.5 text-[13px] font-medium text-soft hover:text-off">
              R$ {formatNumber(s, 0)}
            </button>
          ))}
        </div>
      )}
      {limit > 0 && !getCategory(categoryId).fixed && (
        <p className="text-[14px] text-soft">
          Com esse limite: cerca de <span className="font-semibold text-off"><Money value={previewDaily} />/dia</span>.
        </p>
      )}
      <div className="flex gap-2">
        {status && (
          <Button
            variant="secondary"
            onClick={() => {
              onDone();
              openComposer({ type: "expense", categoryId });
            }}
          >
            Registrar gasto
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={limit <= 0}
          onClick={() => {
            dispatch({ type: "budget/set", budget: { categoryId, limit } });
            toast.show({ title: `${name}: R$ ${formatNumber(limit, 0)} por mês`, body: "Orçamento atualizado." });
            onDone();
          }}
        >
          Salvar limite
        </Button>
      </div>
      {status && (
        <button
          onClick={() => {
            dispatch({ type: "budget/remove", categoryId });
            toast.show({ title: `Orçamento de ${name} removido`, tone: "neutral", action: { label: "Desfazer", onClick: () => dispatch({ type: "budget/set", budget: { categoryId, limit: status.limit } }) } });
            onDone();
          }}
          className="text-[13px] font-medium text-muted hover:text-coral-light"
        >
          Remover este orçamento
        </button>
      )}
    </div>
  );
}
