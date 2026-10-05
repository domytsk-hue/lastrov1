"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, getCategory } from "@/product/data/categories";
import { allBudgets, categoryAverage, type BudgetStatus } from "@/product/domain/finance";
import { capitalize, formatBRL, formatMonthYear, formatNumber, parseISODate } from "@/lib/format";
import { evaluate } from "@/product/domain/calculator";
import type { BudgetState, CategoryId } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import { useUI } from "@/product/store/ui-store";
import { BudgetCard, budgetAdvice } from "@/components/product/budgets/BudgetCard";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { Button, EmptyState, Field, PageHeader, inputClass } from "@/components/shared/ui/primitives";
import { CategoryChip } from "@/components/product/ui/FinanceChips";
import { CategoryIcon } from "@/components/product/ui/CategoryIcon";
import { Capsule, FinancialSurface, StoryTitle } from "@/components/shared/surfaces/Surface";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { useToast } from "@/components/shared/ui/Toast";

const ORDER: Record<BudgetState, number> = { exceeded: 0, critical: 1, attention: 2, healthy: 3 };

export function BudgetsScreen() {
  const { state, today } = useFinance();
  const [editing, setEditing] = useState<CategoryId | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => allBudgets(state, today), [state, today]);

  const variable = [...list.filter((b) => !b.fixed)].sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.pct - a.pct);
  const fixed = list.filter((b) => b.fixed);
  const freeVariable = variable.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  const daily = variable.reduce((s, b) => s + b.dailyAllowance, 0);
  const fixedPaid = fixed.reduce((s, b) => s + b.spent, 0);
  const fixedTotal = fixed.reduce((s, b) => s + b.limit, 0);
  const attention = variable.filter((b) => b.state !== "healthy");
  const unbudgeted = EXPENSE_CATEGORIES.filter((c) => !state.budgets.some((b) => b.categoryId === c.id));
  const daysLeft = list[0]?.daysLeft ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={capitalize(formatMonthYear(today))}
        title="Orçamentos"
        action={
          unbudgeted.length > 0 && list.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Novo
            </Button>
          ) : undefined
        }
      />

      {list.length === 0 ? (
        <FinancialSurface tone="light" radius="xl">
          <EmptyState
            title="Orçamento sem planilha."
            body="Escolha uma categoria e um limite. O Lastro mostra quanto dá para gastar por dia."
            action={<Button onClick={() => setAdding(true)}>Criar primeiro orçamento</Button>}
          />
        </FinancialSurface>
      ) : (
        <>
          <FinancialSurface tone="hero" radius="xl" className="mb-10 p-6 sm:p-8">
            <p className="text-[16px] font-medium text-white/80">Livre para o dia a dia</p>
            <AnimatedMoney value={freeVariable} size="display" cents={false} className="mt-1 text-white" />
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Capsule className="h-10 px-4 text-[15px]">
                ≈ <Money value={daily} /> por dia
              </Capsule>
              <span className="text-[15px] text-white/80">nos próximos {daysLeft} dias</span>
            </div>
            <p className="mt-6 text-[16px] font-medium text-white">
              {attention.length === 0 ? "Seu mês está tranquilo." : `${attention.map((b) => getCategory(b.categoryId).name).join(" e ")} ${attention.length > 1 ? "merecem" : "merece"} atenção.`}
            </p>
          </FinancialSurface>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {variable.map((b, i) => (
              <BudgetCard key={b.categoryId} b={b} index={i} onClick={() => setEditing(b.categoryId)} />
            ))}
          </div>

          {fixed.length > 0 && (
            <section className="mt-12">
              <StoryTitle title="Contas fixas" kicker={`${formatBRL(fixedPaid, { cents: false })} pagos de ${formatBRL(fixedTotal, { cents: false })}`} />
              <ul className="flex flex-col gap-2">
                {fixed.map((b) => (
                  <li key={b.categoryId}>
                    <button onClick={() => setEditing(b.categoryId)} className="flex w-full items-center gap-4 rounded-[24px] bg-white/80 px-4 py-3 text-left transition-transform active:scale-[0.99]">
                      <CategoryIcon id={b.categoryId} size={44} round />
                      <span className="flex-1">
                        <span className="block text-[16px] font-semibold">{getCategory(b.categoryId).name}</span>
                        <span className="text-[14px] text-ink-500">{budgetAdvice(b)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-[17px] font-semibold tabular"><Money value={b.spent} /></span>
                        <span className="text-[13px] text-ink-400">de <Money value={b.limit} /></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <BudgetSheet categoryId={editing} onClose={() => setEditing(null)} status={list.find((b) => b.categoryId === editing)} />
      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Novo orçamento" description="Escolha uma categoria.">
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
      {status && <div className="rounded-[24px] bg-white p-4 text-[15px] leading-snug text-ink-700">{budgetAdvice(status)}</div>}
      <Field label="Limite mensal" hint={avg > 0 ? `Sua média nos últimos 3 meses: ${formatNumber(avg, 0)} reais` : undefined}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-ink-400">R$</span>
          <input autoFocus inputMode="decimal" className={`${inputClass} h-14 pl-11 font-display text-[22px] font-semibold`} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </Field>
      {suggestions.length > 0 && (
        <div className="flex gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setValue(formatNumber(s, 0))} className="h-10 rounded-full bg-white px-4 text-[14px] font-semibold text-ink-700 shadow-[0_6px_16px_-10px_rgba(22,80,180,0.45)] active:scale-95">
              R$ {formatNumber(s, 0)}
            </button>
          ))}
        </div>
      )}
      {limit > 0 && !getCategory(categoryId).fixed && (
        <p className="text-[15px] text-ink-500">
          Com esse limite: cerca de <span className="font-semibold text-ink-900"><Money value={previewDaily} />/dia</span>.
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
          className="text-[14px] font-semibold text-ink-500 hover:text-rose-ink"
        >
          Remover este orçamento
        </button>
      )}
    </div>
  );
}
