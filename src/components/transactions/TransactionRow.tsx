"use client";

import { Repeat } from "lucide-react";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import type { FinanceState, Transaction } from "@/lib/types";
import { useUI } from "@/store/ui-store";
import { TransactionIcon } from "@/components/ui/CategoryIcon";
import { Money } from "@/components/ui/MoneyValue";

function subtitle(tx: Transaction, state: FinanceState) {
  const account = state.accounts.find((a) => a.id === tx.accountId)?.name;
  if (tx.type === "transfer") {
    if (tx.goalId) return `Meta · ${state.goals.find((g) => g.id === tx.goalId)?.name ?? "removida"}`;
    if (tx.toAccountId === state.reserve.accountId) return "Reserva de emergência";
    return `Para ${state.accounts.find((a) => a.id === tx.toAccountId)?.name ?? "conta"}`;
  }
  if (tx.type === "investment") return "Investimento";
  const parts = [getCategory(tx.categoryId).name];
  if (account) parts.push(account);
  return parts.join(" · ");
}

export function TransactionRow({ tx, state, showDate }: { tx: Transaction; state: FinanceState; showDate?: string }) {
  const { openComposer } = useUI();
  const sign = tx.type === "income" ? 1 : tx.type === "expense" ? -1 : 0;
  return (
    <li>
      <button
        onClick={() => openComposer({ edit: tx })}
        className="group flex w-full items-center gap-3 rounded-[18px] px-2 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <TransactionIcon tx={tx} reserveAccountId={state.reserve.accountId} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-medium text-off">
            <span className="truncate">{tx.description}</span>
            {tx.installments && (
              <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-px text-[11px] font-semibold text-soft">
                {tx.installments.current}/{tx.installments.total}
              </span>
            )}
            {tx.recurring !== "none" && <Repeat className="size-3 shrink-0 text-muted" aria-label="Recorrente" />}
          </p>
          <p className="truncate text-[13px] text-muted">
            {showDate ? `${showDate} · ` : ""}
            {subtitle(tx, state)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[15px] font-semibold tabular",
            sign > 0 && "text-green",
            sign < 0 && "text-off",
            sign === 0 && (tx.type === "investment" ? "text-blue-light" : "text-yellow"),
          )}
        >
          {sign > 0 ? "+" : sign < 0 ? "−" : ""}
          <Money value={tx.amount} cents />
        </span>
      </button>
    </li>
  );
}
