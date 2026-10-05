"use client";

import { ChevronLeft, ChevronRight, CreditCard, Landmark, Repeat, Search, ShieldCheck, Target, TrendingUp, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import { accountBalance, inMonth, sum } from "@/lib/finance";
import { addMonths, capitalize, formatMonthYear, formatNumber, formatRelativeDay, monthKey, startOfMonth } from "@/lib/format";
import type { AccountType, Transaction, TransactionType } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Money, MoneyValue } from "@/components/ui/MoneyValue";
import { Button, EmptyState, PageHeader, Segmented, inputClass } from "@/components/ui/primitives";

type Tab = "transacoes" | "contas" | "recorrentes";
type Filter = "all" | TransactionType;

export function MovementsScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (params.get("aba") as Tab) || "transacoes";
  const setTab = (t: Tab) => router.replace(t === "transacoes" ? pathname : `${pathname}?aba=${t}`, { scroll: false });

  return (
    <>
      <PageHeader eyebrow="Movimentos" title="Movimentações" />
      <Segmented
        label="Seção"
        value={tab}
        onChange={setTab}
        className="mb-6 lg:max-w-md"
        options={[
          { value: "transacoes", label: "Transações" },
          { value: "contas", label: "Contas" },
          { value: "recorrentes", label: "Recorrentes" },
        ]}
      />
      {tab === "transacoes" && <TransactionsTab />}
      {tab === "contas" && <AccountsTab />}
      {tab === "recorrentes" && <RecurringTab />}
    </>
  );
}

/* ---------------- Transactions ---------------- */

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Receitas" },
  { value: "transfer", label: "Guardado" },
  { value: "investment", label: "Investido" },
];

function TransactionsTab() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const [month, setMonth] = useState(monthKey(today));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const isCurrent = month === monthKey(today);
  const monthTxs = useMemo(() => inMonth(state.transactions, month), [state.transactions, month]);
  const past = monthTxs.filter((t) => t.date <= today);
  const upcoming = monthTxs.filter((t) => t.date > today).reverse();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return past.filter(
      (t) =>
        (filter === "all" || t.type === filter) &&
        (!q || t.description.toLowerCase().includes(q) || getCategory(t.categoryId).name.toLowerCase().includes(q) || t.tags.some((g) => g.includes(q))),
    );
  }, [past, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [filtered]);

  const income = sum(past.filter((t) => t.type === "income"));
  const expenses = sum(past.filter((t) => t.type === "expense"));
  const minMonth = monthKey(state.transactions[state.transactions.length - 1]?.date ?? today);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <div className="card p-5 lg:sticky lg:top-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonth(monthKey(addMonths(`${month}-01`, -1)))}
              disabled={month <= minMonth}
              className="pressable grid size-9 place-items-center rounded-full bg-white/[0.05] disabled:opacity-30"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="font-display text-[17px] font-semibold">{capitalize(formatMonthYear(month))}</p>
            <button
              onClick={() => setMonth(monthKey(addMonths(`${month}-01`, 1)))}
              disabled={isCurrent}
              className="pressable grid size-9 place-items-center rounded-full bg-white/[0.05] disabled:opacity-30"
              aria-label="Próximo mês"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[12px] text-muted">Entradas</dt>
              <dd className="mt-1 text-green">
                <MoneyValue value={income} size="md" cents={false} />
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Saídas</dt>
              <dd className="mt-1">
                <MoneyValue value={expenses} size="md" cents={false} />
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="text-[12px] text-muted">{isCurrent ? "Saldo do mês até hoje" : "Saldo do mês"}</p>
            <MoneyValue value={income - expenses} size="lg" cents={false} sign className="mt-1" tone={income - expenses >= 0 ? "positive" : undefined} />
          </div>
        </div>
      </div>

      <div className="lg:col-span-8">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por descrição, categoria ou tag" className={cn(inputClass, "pl-11")} aria-label="Buscar movimentações" />
        </div>
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="radiogroup" aria-label="Filtrar por tipo">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "pressable h-9 shrink-0 rounded-full px-4 text-[14px] font-medium",
                filter === f.value ? "bg-off text-ink" : "bg-white/[0.05] text-soft hover:text-off",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isCurrent && upcoming.length > 0 && filter === "all" && !query && (
          <div className="mb-5">
            <p className="eyebrow mb-1 px-2">Próximas</p>
            <ul className="card p-2 opacity-80">
              {upcoming.map((t) => (
                <TransactionRow key={t.id} tx={t} state={state} showDate={formatRelativeDay(t.date, today)} />
              ))}
            </ul>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="card">
            {past.length === 0 ? (
              <EmptyState
                title="Seu mês começa aqui."
                body="Registre seu primeiro gasto e o Lastro começa a entender seu ritmo."
                action={<Button onClick={() => openComposer({ type: "expense" })}>Registrar gasto</Button>}
              />
            ) : (
              <EmptyState title="Nada por aqui." body="Nenhuma movimentação combina com esse filtro. Tente outra busca." />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([date, txs]) => {
              const dayOut = sum(txs.filter((t) => t.type === "expense"));
              return (
                <section key={date} aria-label={formatRelativeDay(date, today)}>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h3 className="text-[13px] font-semibold text-soft first-letter:uppercase">{formatRelativeDay(date, today)}</h3>
                    {dayOut > 0 && (
                      <span className="text-[12px] text-muted tabular">
                        −<Money value={dayOut} cents />
                      </span>
                    )}
                  </div>
                  <ul className="card p-2">
                    {txs.map((t) => (
                      <TransactionRow key={t.id} tx={t} state={state} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Accounts ---------------- */

const ACCOUNT_ICON: Record<AccountType, typeof Wallet> = {
  checking: Landmark,
  cash: Wallet,
  savings: Target,
  reserve: ShieldCheck,
  investment: TrendingUp,
  credit_card: CreditCard,
};

function AccountsTab() {
  const { state, today } = useFinance();
  const { openComposer } = useUI();
  const rows = state.accounts.map((a) => ({ a, balance: accountBalance(state, a, today) }));
  const total = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="card-raised p-5 lg:col-span-4 lg:self-start">
        <p className="text-[13px] text-soft">Somando todas as contas</p>
        <MoneyValue value={total} size="xl" cents={false} className="mt-1" />
        <p className="mt-2 text-[13px] text-muted">Já descontando a fatura do cartão.</p>
      </div>
      <ul className="flex flex-col gap-3 lg:col-span-8">
        {rows.map(({ a, balance }) => {
          const Icon = ACCOUNT_ICON[a.type];
          const card = a.type === "credit_card";
          return (
            <li key={a.id} className="card flex items-center gap-4 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: `${a.color}1f`, color: a.color }}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{a.name}</p>
                <p className="truncate text-[13px] text-muted">{card ? "Fatura atual" : a.institution}</p>
              </div>
              <div className="text-right">
                <MoneyValue value={card ? -balance : balance} size="sm" />
                {card && balance < 0 && (
                  <button onClick={() => openComposer({ type: "transfer", toAccountId: a.id, text: formatNumber(-balance, 2) })} className="mt-1 block text-[12px] font-semibold text-green hover:underline">
                    Pagar fatura
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- Recurring ---------------- */

function RecurringTab() {
  const { state, today } = useFinance();
  const items = useMemo(() => {
    const latest = new Map<string, Transaction>();
    for (const t of state.transactions) {
      if (t.recurring === "none" || t.date > today) continue;
      const key = `${t.type}:${t.description}`;
      if (!latest.has(key)) latest.set(key, t);
    }
    return [...latest.values()].filter((t) => t.date >= addMonths(startOfMonth(today), -1));
  }, [state.transactions, today]);

  const expenses = items.filter((t) => t.type === "expense");
  const other = items.filter((t) => t.type !== "expense");
  const monthly = sum(expenses.filter((t) => t.recurring === "monthly"));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="card-raised p-5 lg:col-span-4 lg:self-start">
        <p className="text-[13px] text-soft">Compromissos fixos por mês</p>
        <MoneyValue value={monthly} size="xl" cents={false} className="mt-1" />
        <p className="mt-2 text-[13px] text-muted">
          <Money value={monthly * 12} /> por ano. Revisar uma assinatura por mês já faz diferença.
        </p>
      </div>
      <div className="flex flex-col gap-5 lg:col-span-8">
        <section>
          <h3 className="eyebrow mb-2 px-2">Contas e assinaturas</h3>
          <ul className="card p-2">
            {expenses
              .sort((a, b) => b.amount - a.amount)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-2 py-2.5">
                  <CategoryIcon id={t.categoryId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{t.description}</p>
                    <p className="text-[13px] text-muted">
                      Todo dia {Number(t.date.slice(8))} · {getCategory(t.categoryId).name}
                    </p>
                  </div>
                  <span className="text-[15px] font-semibold tabular">
                    <Money value={t.amount} cents />
                  </span>
                </li>
              ))}
          </ul>
        </section>
        {other.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2 px-2">Entradas e aportes automáticos</h3>
            <ul className="card p-2">
              {other.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="grid size-10 place-items-center rounded-[14px] bg-white/[0.05] text-soft">
                    <Repeat className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{t.description}</p>
                    <p className="text-[13px] text-muted">Todo dia {Number(t.date.slice(8))}</p>
                  </div>
                  <span className={cn("text-[15px] font-semibold tabular", t.type === "income" ? "text-green" : t.type === "investment" ? "text-blue-light" : "text-yellow")}>
                    <Money value={t.amount} cents />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
