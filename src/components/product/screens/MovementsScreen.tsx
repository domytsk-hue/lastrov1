"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CreditCard, Landmark, Repeat, Search, ShieldCheck, Target, TrendingUp, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { getCategory } from "@/product/data/categories";
import { cn } from "@/lib/cn";
import { accountBalance, inMonth, sum } from "@/product/domain/finance";
import { addMonths, capitalize, formatMonthYear, formatNumber, formatRelativeDay, monthKey, startOfMonth } from "@/lib/format";
import { spring } from "@/design-system/motion";
import type { AccountType, Transaction, TransactionType } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import { useUI } from "@/product/store/ui-store";
import { TransactionItem } from "@/components/product/transactions/TransactionItem";
import { AnimatedMoney, Money } from "@/components/shared/motion/AnimatedNumber";
import { CategoryIcon } from "@/components/product/ui/CategoryIcon";
import { Button, EmptyState, PageHeader, Segmented } from "@/components/shared/ui/primitives";
import { Capsule, FinancialSurface } from "@/components/shared/surfaces/Surface";

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
      <PageHeader eyebrow="Para onde o dinheiro foi" title="Movimentos" />
      <Segmented
        label="Seção"
        value={tab}
        onChange={setTab}
        className="mb-8 lg:max-w-md"
        options={[
          { value: "transacoes", label: "Transações" },
          { value: "contas", label: "Contas" },
          { value: "recorrentes", label: "Recorrentes" },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.soft}>
          {tab === "transacoes" && <TransactionsTab />}
          {tab === "contas" && <AccountsTab />}
          {tab === "recorrentes" && <RecurringTab />}
        </motion.div>
      </AnimatePresence>
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
  const filterId = useId();
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
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-4">
        <FinancialSurface tone="navy" radius="organic" className="p-6 lg:sticky lg:top-32">
          <div className="flex items-center justify-between">
            <MonthButton dir="prev" disabled={month <= minMonth} onClick={() => setMonth(monthKey(addMonths(`${month}-01`, -1)))} />
            <p className="font-display text-[18px] font-semibold">{capitalize(formatMonthYear(month))}</p>
            <MonthButton dir="next" disabled={isCurrent} onClick={() => setMonth(monthKey(addMonths(`${month}-01`, 1)))} />
          </div>
          <p className="mt-8 text-[15px] text-white/65">{isCurrent ? "Saldo do mês até hoje" : "Saldo do mês"}</p>
          <AnimatedMoney value={income - expenses} size="hero" cents={false} sign className={cn("mt-1", income - expenses >= 0 ? "text-mint" : "text-white")} />
          <div className="mt-6 flex flex-wrap gap-2">
            <Capsule>
              Entrou <Money value={income} />
            </Capsule>
            <Capsule>
              Saiu <Money value={expenses} />
            </Capsule>
          </div>
        </FinancialSurface>
      </div>

      <div className="min-w-0 lg:col-span-8">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar movimentações"
            className="field-input h-14 w-full rounded-full bg-white/80 pr-5 pl-12 text-[16px] text-ink-900 shadow-[inset_0_1px_0_#fff,0_10px_24px_-16px_rgba(22,80,180,0.5)] outline-none placeholder:text-ink-400 focus:bg-white"
          />
        </div>
        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0" role="radiogroup" aria-label="Filtrar por tipo">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                role="radio"
                aria-checked={active}
                onClick={() => setFilter(f.value)}
                className={cn("relative h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors", active ? "text-white" : "bg-white/60 text-ink-700 hover:bg-white")}
              >
                {active && <motion.span layoutId={`${filterId}-f`} className="absolute inset-0 rounded-full bg-midnight" transition={spring.snappy} />}
                <span className="relative">{f.label}</span>
              </button>
            );
          })}
        </div>

        {isCurrent && upcoming.length > 0 && filter === "all" && !query && (
          <section className="mb-8">
            <h3 className="mb-2 px-2 text-[15px] font-semibold text-ink-500">Próximas</h3>
            <ul className="flex flex-col gap-2 opacity-75">
              {upcoming.map((t) => (
                <TransactionItem key={t.id} tx={t} />
              ))}
            </ul>
          </section>
        )}

        {groups.length === 0 ? (
          <FinancialSurface tone="light" radius="lg">
            {past.length === 0 ? (
              <EmptyState title="Seu mês começa aqui." body="O primeiro gasto ensina ao Lastro o seu ritmo." action={<Button variant="mint" onClick={() => openComposer({ type: "expense" })}>Registrar gasto</Button>} />
            ) : (
              <EmptyState title="Nada por aqui." body="Nenhuma movimentação combina com esse filtro." />
            )}
          </FinancialSurface>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map(([date, txs]) => {
              const dayOut = sum(txs.filter((t) => t.type === "expense"));
              return (
                <section key={date} aria-label={formatRelativeDay(date, today)}>
                  <div className="mb-2 flex items-baseline justify-between px-2">
                    <h3 className="font-display text-[20px] font-semibold tracking-[-0.015em] text-ink-900 first-letter:uppercase">{formatRelativeDay(date, today)}</h3>
                    {dayOut > 0 && (
                      <span className="text-[14px] font-medium text-ink-500 tabular">
                        −<Money value={dayOut} cents />
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {txs.map((t) => (
                        <TransactionItem key={t.id} tx={t} showDay={false} />
                      ))}
                    </AnimatePresence>
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

function MonthButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button onClick={onClick} disabled={disabled} className="surface-glass grid size-10 place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-30" aria-label={dir === "prev" ? "Mês anterior" : "Próximo mês"}>
      <Icon className="size-5" />
    </button>
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
    <div className="flex flex-col gap-8">
      <div className="px-1">
        <p className="text-[16px] font-medium text-ink-500">Somando tudo, já sem a fatura</p>
        <AnimatedMoney value={total} size="display" cents={false} className="mt-1 text-ink-900" />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ a, balance }, i) => {
          const Icon = ACCOUNT_ICON[a.type];
          const card = a.type === "credit_card";
          return (
            <li key={a.id}>
              <FinancialSurface tone={card ? "navy" : "light"} radius={i % 2 ? "organicR" : "organic"} interactive className="flex h-full flex-col p-6">
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-11 place-items-center rounded-full", card ? "bg-white/12 text-white" : "")} style={card ? undefined : { background: `${a.color}22`, color: a.color }}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold">{a.name}</p>
                    <p className={cn("truncate text-[14px]", card ? "text-white/60" : "text-ink-500")}>{card ? "Fatura atual" : a.institution}</p>
                  </div>
                </div>
                <AnimatedMoney value={card ? -balance : balance} size="xl" cents={false} className="mt-6" />
                {card && balance < 0 && (
                  <button
                    onClick={() => openComposer({ type: "transfer", toAccountId: a.id, text: formatNumber(-balance, 2) })}
                    className="mt-5 h-11 self-start rounded-full bg-mint px-5 text-[14px] font-semibold text-midnight active:scale-[0.97]"
                  >
                    Pagar fatura
                  </button>
                )}
              </FinancialSurface>
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

  const expenses = items.filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount);
  const other = items.filter((t) => t.type !== "expense");
  const monthly = sum(expenses.filter((t) => t.recurring === "monthly"));

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="px-1 lg:col-span-5">
        <p className="text-[16px] font-medium text-ink-500">Compromissos fixos</p>
        <AnimatedMoney value={monthly} size="display" cents={false} className="mt-1 text-ink-900" />
        <p className="mt-2 text-[17px] text-ink-700">
          por mês · <Money value={monthly * 12} /> por ano
        </p>
        <p className="mt-6 max-w-xs text-[15px] text-ink-500">Revisar uma assinatura por mês já faz diferença.</p>
      </div>
      <div className="flex flex-col gap-8 lg:col-span-7">
        <ul className="flex flex-col gap-2">
          {expenses.map((t) => (
            <li key={t.id} className="flex items-center gap-3.5 rounded-[24px] bg-white px-3 py-3">
              <CategoryIcon id={t.categoryId} size={44} round />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold">{t.description}</p>
                <p className="text-[14px] text-ink-500">
                  Todo dia {Number(t.date.slice(8))} · {getCategory(t.categoryId).name}
                </p>
              </div>
              <span className="font-display text-[17px] font-semibold tabular">
                <Money value={t.amount} cents />
              </span>
            </li>
          ))}
        </ul>
        {other.length > 0 && (
          <section>
            <h3 className="mb-2 px-2 text-[15px] font-semibold text-ink-500">Entradas e aportes automáticos</h3>
            <ul className="flex flex-col gap-2">
              {other.map((t) => (
                <li key={t.id} className="flex items-center gap-3.5 rounded-[24px] bg-white/70 px-3 py-3">
                  <span className="grid size-11 place-items-center rounded-full bg-electric/10 text-electric">
                    <Repeat className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold">{t.description}</p>
                    <p className="text-[14px] text-ink-500">Todo dia {Number(t.date.slice(8))}</p>
                  </div>
                  <span className={cn("font-display text-[17px] font-semibold tabular", t.type === "income" ? "text-mint-ink" : "text-electric")}>
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
