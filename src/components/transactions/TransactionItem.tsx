"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { Copy, Pencil, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { getCategory } from "@/data/categories";
import { cn } from "@/lib/cn";
import { formatDate, formatRelativeDay } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { FinanceState, Transaction } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { Money } from "@/components/ui/AnimatedNumber";
import { TransactionIcon } from "@/components/ui/CategoryIcon";
import { useToast } from "@/components/ui/Toast";

export function describe(tx: Transaction, state: FinanceState) {
  if (tx.type === "transfer") {
    if (tx.goalId) return `Meta · ${state.goals.find((g) => g.id === tx.goalId)?.name ?? "removida"}`;
    if (tx.toAccountId === state.reserve.accountId) return "Reserva";
    return `Para ${state.accounts.find((a) => a.id === tx.toAccountId)?.name ?? "conta"}`;
  }
  if (tx.type === "investment") return "Investimento";
  return getCategory(tx.categoryId).name;
}

const ACTIONS_W = 180;

/**
 * A movement as a calm line: icon, what, when · category, amount.
 * Tap → expands in place with details and actions. Swipe left (touch) → edit, duplicate, delete.
 */
export function TransactionItem({ tx, tone = "light", showDay = true }: { tx: Transaction; tone?: "light" | "navy"; showDay?: boolean }) {
  const { state, today, dispatch } = useFinance();
  const { openComposer } = useUI();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const actionsOpacity = useTransform(x, [-ACTIONS_W, -40, 0], [1, 0.6, 0]);
  const navy = tone === "navy";

  const sign = tx.type === "income" ? 1 : tx.type === "expense" ? -1 : 0;
  const close = () => animate(x, 0, spring.snappy);

  const edit = () => {
    close();
    openComposer({ edit: tx });
  };
  const duplicate = () => {
    close();
    const { id: _id, createdAt: _c, installments: _i, ...rest } = tx;
    dispatch({ type: "transaction/add", input: { ...rest, date: today, recurring: "none" } });
    toast.show({ title: `${tx.description} duplicado para hoje` });
  };
  const remove = () => {
    dispatch({ type: "transaction/delete", id: tx.id });
    toast.show({ title: "Movimentação removida", tone: "neutral", action: { label: "Desfazer", onClick: () => dispatch({ type: "transaction/restore", txs: [tx] }) } });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    animate(x, info.offset.x < -60 || info.velocity.x < -400 ? -ACTIONS_W : 0, spring.snappy);
  };

  const sub = [showDay ? formatRelativeDay(tx.date, today) : null, describe(tx, state)].filter(Boolean).join(" · ");

  return (
    <motion.li layout={!reduce} transition={spring.soft} className="relative list-none overflow-hidden rounded-[24px]" exit={{ opacity: 0, height: 0 }}>
      {/* swipe actions */}
      <motion.div className="absolute inset-y-0 right-2 flex items-center gap-2" style={{ opacity: actionsOpacity }} aria-hidden>
        <SwipeAction label="Editar" onClick={edit} className="bg-electric text-white" icon={<Pencil className="size-[18px]" />} />
        <SwipeAction label="Duplicar" onClick={duplicate} className="bg-sky text-midnight" icon={<Copy className="size-[18px]" />} />
        <SwipeAction label="Excluir" onClick={remove} className="bg-rose text-white" icon={<Trash2 className="size-[18px]" />} />
      </motion.div>

      <motion.div
        style={{ x }}
        drag={reduce ? false : "x"}
        dragConstraints={{ left: -ACTIONS_W, right: 0 }}
        dragElastic={0.08}
        dragDirectionLock
        onDragEnd={onDragEnd}
        className={cn("relative rounded-[24px] touch-pan-y", navy ? "bg-[#0d2a68]" : "bg-white", open && (navy ? "bg-[#12357d]" : "shadow-[0_14px_30px_-18px_rgba(22,80,180,0.5)]"))}
      >
        <button
          onClick={() => (x.get() < -10 ? close() : setOpen((o) => !o))}
          aria-expanded={open}
          className="flex w-full items-center gap-3.5 px-3 py-3 text-left"
        >
          <TransactionIcon tx={tx} reserveAccountId={state.reserve.accountId} size={44} round />
          <span className="min-w-0 flex-1">
            <span className={cn("flex items-center gap-1.5 truncate text-[16px] font-semibold", navy ? "text-white" : "text-ink-900")}>
              <span className="truncate">{tx.description}</span>
              {tx.installments && <span className={cn("shrink-0 rounded-full px-1.5 text-[11px] font-bold", navy ? "bg-white/10 text-white/70" : "bg-ink-900/5 text-ink-500")}>{tx.installments.current}/{tx.installments.total}</span>}
              {tx.recurring !== "none" && <Repeat className={cn("size-3.5 shrink-0", navy ? "text-white/40" : "text-ink-400")} aria-label="Recorrente" />}
            </span>
            <span className={cn("block truncate text-[14px] first-letter:uppercase", navy ? "text-white/55" : "text-ink-500")}>{sub}</span>
          </span>
          <span
            className={cn(
              "shrink-0 font-display text-[17px] font-semibold tabular",
              sign > 0 && (navy ? "text-mint" : "text-mint-ink"),
              sign < 0 && (navy ? "text-white" : "text-ink-900"),
              sign === 0 && (navy ? "text-sky" : "text-electric"),
            )}
          >
            {sign > 0 ? "+" : sign < 0 ? "−" : ""}
            <Money value={tx.amount} cents />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.soft} className="overflow-hidden">
              <div className={cn("px-4 pb-4 text-[14px]", navy ? "text-white/70" : "text-ink-500")}>
                <p>
                  {formatDate(tx.date)} · {state.accounts.find((a) => a.id === tx.accountId)?.name}
                  {tx.installments && ` · parcela ${tx.installments.current} de ${tx.installments.total}`}
                </p>
                {tx.tags.length > 0 && <p className="mt-1">#{tx.tags.join(" #")}</p>}
                {tx.notes && <p className="mt-1">{tx.notes}</p>}
                <div className="mt-3 flex gap-2">
                  <InlineAction onClick={edit} navy={navy} icon={<Pencil className="size-4" />}>
                    Editar
                  </InlineAction>
                  <InlineAction onClick={duplicate} navy={navy} icon={<Copy className="size-4" />}>
                    Duplicar
                  </InlineAction>
                  <InlineAction onClick={remove} navy={navy} danger icon={<Trash2 className="size-4" />}>
                    Excluir
                  </InlineAction>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.li>
  );
}

function SwipeAction({ label, onClick, className, icon }: { label: string; onClick: () => void; className: string; icon: React.ReactNode }) {
  return (
    <button tabIndex={-1} onClick={onClick} className={cn("grid size-12 place-items-center rounded-full active:scale-95", className)} aria-label={label}>
      {icon}
    </button>
  );
}

function InlineAction({ children, onClick, icon, navy, danger }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; navy: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-transform active:scale-[0.97]",
        danger ? (navy ? "bg-rose/20 text-[#ffb3bf]" : "bg-rose/10 text-rose-ink") : navy ? "bg-white/10 text-white" : "bg-ink-900/5 text-ink-900",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
