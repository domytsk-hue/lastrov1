"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, Keyboard, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from "@/data/categories";
import { evaluate, isArithmetic } from "@/lib/calculator";
import { cn } from "@/lib/cn";
import { feedbackFor } from "@/lib/feedback";
import { addDays, formatBRL, formatNumber, formatRelativeDay } from "@/lib/format";
import { parseQuickEntry } from "@/lib/quick-entry";
import type { CategoryId, InvestmentClass, Recurrence, TransactionType } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import type { TransactionInput } from "@/store/reducer";
import { useUI } from "@/store/ui-store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CategoryChip, Field, Segmented, inputClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Keypad, type KeypadKey } from "./Keypad";

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Guardar" },
  { value: "investment", label: "Investir" },
];

const CLASSES: { value: InvestmentClass; label: string }[] = [
  { value: "renda-fixa", label: "Renda fixa" },
  { value: "acoes", label: "Ações" },
  { value: "fiis", label: "FIIs" },
  { value: "etfs", label: "ETFs" },
  { value: "fundos", label: "Fundos" },
  { value: "internacional", label: "Internacional" },
  { value: "cripto", label: "Cripto" },
  { value: "outros", label: "Outros" },
];

const RECURRENCE: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Não repete" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

type Destination = { kind: "reserve" } | { kind: "goal"; id: string } | { kind: "account"; id: string };

/** Turns a keypad press into the next expression string. */
function applyKey(text: string, k: KeypadKey): string {
  if (k === "back") return text.slice(0, -1);
  if (k === "clear") return "";
  if (k === "=") {
    const r = evaluate(text);
    return r ? formatNumber(r.value, 2).replace(/,00$/, "") : text;
  }
  const ops = ["+", "-", "×", "÷"];
  if (ops.includes(k)) {
    const t = text.trimEnd();
    if (!t) return text;
    const last = t.slice(-1);
    // Replace a trailing operator instead of stacking them.
    if (ops.includes(last) || last === "−") return `${t.slice(0, -1).trimEnd()} ${k} `;
    return `${t} ${k} `;
  }
  if (k === ",") {
    const lastNumber = text.split(/[\s+\-×÷]/).pop() ?? "";
    if (lastNumber.includes(",")) return text;
    return lastNumber ? `${text},` : `${text}0,`;
  }
  return text + k;
}

export function TransactionComposer() {
  const { composer, closeComposer } = useUI();
  return (
    <BottomSheet open={!!composer} onClose={closeComposer} title={composer?.edit ? "Editar movimentação" : "Nova movimentação"} hideTitle size="md">
      {composer && <ComposerBody key={composer.edit?.id ?? JSON.stringify(composer)} />}
    </BottomSheet>
  );
}

function ComposerBody() {
  const { state, today, dispatch } = useFinance();
  const { composer, closeComposer } = useUI();
  const toast = useToast();
  const edit = composer?.edit;
  const checking = state.accounts.find((a) => a.type === "checking")!;

  const initialDestination = (): Destination => {
    if (edit?.goalId) return { kind: "goal", id: edit.goalId };
    if (edit?.toAccountId && edit.toAccountId !== state.reserve.accountId && edit.type === "transfer") return { kind: "account", id: edit.toAccountId };
    if (composer?.goalId) return { kind: "goal", id: composer.goalId };
    if (composer?.toAccountId) return { kind: "account", id: composer.toAccountId };
    return { kind: "reserve" };
  };

  const [type, setType] = useState<TransactionType>(edit?.type ?? composer?.type ?? (composer?.toReserve || composer?.goalId || composer?.toAccountId ? "transfer" : "expense"));
  const [text, setText] = useState(edit ? formatNumber(edit.amount, 2).replace(/,00$/, "") : (composer?.text ?? ""));
  const [categoryId, setCategoryId] = useState<CategoryId | undefined>(edit?.categoryId ?? composer?.categoryId);
  const [categoryTouched, setCategoryTouched] = useState(!!edit || !!composer?.categoryId);
  const [description, setDescription] = useState(edit?.description ?? "");
  const [descTouched, setDescTouched] = useState(!!edit);
  const [accountId, setAccountId] = useState(edit?.accountId ?? checking.id);
  const [date, setDate] = useState(edit?.date ?? today);
  const [recurring, setRecurring] = useState<Recurrence>(edit?.recurring ?? "none");
  const [installments, setInstallments] = useState<number | undefined>();
  const [tags, setTags] = useState(edit?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [destination, setDestination] = useState<Destination>(initialDestination);
  const [investmentClass, setInvestmentClass] = useState<InvestmentClass>(edit?.investmentClass ?? "renda-fixa");
  const [showMore, setShowMore] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [touchDevice, setTouchDevice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  /* ---------- interpretation ---------- */
  const parsed = useMemo(() => (text && !isArithmetic(text) ? parseQuickEntry(text, today) : null), [text, today]);
  const calc = useMemo(() => (text && isArithmetic(text) ? evaluate(text) : null), [text]);
  const amount = calc?.value ?? parsed?.amount ?? 0;
  const splitSuggestion = calc?.installments ?? (parsed?.installments && parsed.amount ? { total: parsed.amount, count: parsed.installments, each: parsed.amount / parsed.installments } : undefined);

  // Apply what the smart field inferred, without overriding manual choices.
  useEffect(() => {
    if (!parsed || edit) return;
    if (parsed.inferred.includes("type")) {
      setType(parsed.type);
      if (parsed.destination === "reserve") setDestination({ kind: "reserve" });
    }
    if (!categoryTouched && parsed.categoryId) setCategoryId(parsed.categoryId);
    if (!descTouched) setDescription(parsed.description);
    if (parsed.inferred.includes("date")) setDate(parsed.date);
    // "1200 notebook em 4x" — explicit installments are applied right away.
    if (parsed.installments && /\d\s?x\b/i.test(text)) setInstallments(parsed.installments);
  }, [parsed, edit, categoryTouched, descTouched, text]);

  const finalAmount = installments && splitSuggestion ? Math.round(splitSuggestion.each * 100) / 100 : amount;

  /* ---------- defaults per type ---------- */
  const categoryList = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const effectiveCategory: CategoryId | undefined =
    type === "expense" || type === "income"
      ? categoryList.some((c) => c.id === categoryId)
        ? categoryId
        : undefined
      : undefined;

  const destinationLabel = (() => {
    if (type !== "transfer") return "";
    if (destination.kind === "reserve") return "Reserva de emergência";
    if (destination.kind === "goal") return state.goals.find((g) => g.id === destination.id)?.name ?? "Meta";
    return state.accounts.find((a) => a.id === destination.id)?.name ?? "Conta";
  })();

  const canSave = finalAmount > 0 && (type !== "expense" || !!effectiveCategory);

  const save = useCallback(() => {
    if (!canSave) {
      if (finalAmount > 0 && type === "expense" && !effectiveCategory) {
        toast.show({ title: "Escolha uma categoria", body: "Assim o Lastro atualiza o orçamento certo.", tone: "neutral" });
      }
      return;
    }
    const desc =
      description.trim() ||
      (type === "expense" || type === "income"
        ? getCategory(effectiveCategory).name
        : type === "investment"
          ? `Aporte — ${CLASSES.find((c) => c.value === investmentClass)!.label}`
          : destinationLabel);

    const input: TransactionInput = {
      type,
      amount: finalAmount,
      description: desc,
      categoryId: effectiveCategory,
      accountId,
      date,
      recurring,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
      installments: type === "expense" ? installments : undefined,
    };
    if (type === "transfer") {
      if (destination.kind === "reserve") input.toAccountId = state.reserve.accountId;
      else if (destination.kind === "goal") {
        input.goalId = destination.id;
        input.toAccountId = state.accounts.find((a) => a.type === "savings")?.id;
      } else input.toAccountId = destination.id;
    }
    if (type === "investment") {
      input.toAccountId = state.accounts.find((a) => a.type === "investment")?.id;
      input.investmentClass = investmentClass;
    }

    const prevTxIds = new Set(state.transactions.map((t) => t.id));
    const next = edit ? dispatch({ type: "transaction/update", id: edit.id, input }) : dispatch({ type: "transaction/add", input });
    const created = next.transactions.filter((t) => !prevTxIds.has(t.id));

    const fb = feedbackFor(input, next, today);
    if ("vibrate" in navigator) navigator.vibrate?.([8, 40, 12]);
    closeComposer();
    toast.show({
      title: edit ? "Movimentação atualizada" : fb.title,
      body: edit ? undefined : (installments && type === "expense" ? `${installments}× de ${formatBRL(finalAmount)}. ` : "") + (fb.body ?? ""),
      tone: fb.tone,
      action: edit
        ? undefined
        : {
            label: "Desfazer",
            onClick: () => {
              for (const t of created) dispatch({ type: "transaction/delete", id: t.id });
            },
          },
    });
  }, [canSave, finalAmount, type, effectiveCategory, description, investmentClass, destinationLabel, accountId, date, recurring, tags, notes, installments, destination, state, edit, dispatch, today, closeComposer, toast]);

  const remove = () => {
    if (!edit) return;
    dispatch({ type: "transaction/delete", id: edit.id });
    closeComposer();
    toast.show({
      title: "Movimentação removida",
      tone: "neutral",
      action: { label: "Desfazer", onClick: () => dispatch({ type: "transaction/restore", txs: [edit] }) },
    });
  };

  const onKey = (k: KeypadKey) => {
    setText((t) => applyKey(t, k));
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  const accent = type === "income" ? "text-green" : type === "investment" ? "text-blue-light" : type === "transfer" ? "text-yellow" : "text-off";
  const accounts = state.accounts.filter((a) => ["checking", "cash", ...(type === "expense" ? ["credit_card"] : [])].includes(a.type));

  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Tipo de movimentação" value={type} onChange={setType} options={TYPE_OPTIONS} />

      {/* Amount */}
      <div className="flex flex-col items-center pt-2 text-center">
        <motion.div
          key={type}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex items-baseline font-display font-semibold tabular", accent, finalAmount === 0 && "opacity-40")}
          aria-live="polite"
        >
          <span className="mr-1.5 font-sans text-[20px] font-medium opacity-60">R$</span>
          <span className="text-[52px] leading-none tracking-[-0.04em]">{formatNumber(finalAmount, 2).split(",")[0]}</span>
          <span className="text-[24px] opacity-55">,{formatNumber(finalAmount, 2).split(",")[1]}</span>
        </motion.div>
        <div className="mt-2 flex min-h-[28px] flex-wrap items-center justify-center gap-2">
          {calc?.isExpression && <span className="text-[14px] text-soft tabular">{text.replace(/\s+$/, "")}</span>}
          {type === "expense" && splitSuggestion && (
            <button
              type="button"
              onClick={() => setInstallments((i) => (i ? undefined : splitSuggestion.count))}
              aria-pressed={!!installments}
              className={cn(
                "pressable rounded-full px-3 py-1 text-[13px] font-semibold",
                installments ? "bg-blue-light text-ink" : "bg-blue/20 text-blue-light",
              )}
            >
              {installments ? "✓ " : ""}
              {splitSuggestion.count}× de {formatBRL(splitSuggestion.each)}
              {!installments && " · parcelar"}
            </button>
          )}
          {parsed && parsed.inferred.length > 0 && !calc && (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted">
              <Sparkles className="size-3.5 text-purple-light" />
              Entendi: {[parsed.amount && formatBRL(parsed.amount), effectiveCategory && getCategory(effectiveCategory).name, formatRelativeDay(date, today).toLowerCase()].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* Smart field */}
      <div className="relative">
        <input
          ref={inputRef}
          autoFocus={!touchDevice}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onInputKey}
          inputMode={touchDevice && !keyboardMode ? "none" : "text"}
          placeholder={type === "income" ? "Ex.: 3500 salário" : type === "transfer" ? "Ex.: 300 reserva" : "Ex.: 45 almoço · 125+32,50"}
          aria-label="Valor ou descrição rápida"
          className={cn(inputClass, "h-[52px] pr-12 text-[16px]")}
        />
        <button
          type="button"
          onClick={() => {
            setKeyboardMode((m) => !m);
            window.setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className={cn("absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted hover:text-off lg:hidden", keyboardMode && "bg-white/10 text-off")}
          aria-label={keyboardMode ? "Usar calculadora" : "Digitar texto"}
          aria-pressed={keyboardMode}
        >
          <Keyboard className="size-[18px]" />
        </button>
      </div>

      {/* What it is */}
      {(type === "expense" || type === "income") && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Categoria">
          {categoryList.map((c) => (
            <CategoryChip
              key={c.id}
              id={c.id}
              compact
              selected={effectiveCategory === c.id}
              onClick={() => {
                setCategoryId(c.id);
                setCategoryTouched(true);
              }}
            />
          ))}
        </div>
      )}

      {type === "transfer" && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Destino">
          <DestChip active={destination.kind === "reserve"} onClick={() => setDestination({ kind: "reserve" })} icon={<ShieldCheck className="size-3.5" />} color="#00D99B">
            Reserva
          </DestChip>
          {state.goals.map((g) => (
            <DestChip key={g.id} active={destination.kind === "goal" && destination.id === g.id} onClick={() => setDestination({ kind: "goal", id: g.id })} icon={<Target className="size-3.5" />} color="#FFC234">
              {g.name}
            </DestChip>
          ))}
          {state.accounts
            .filter((a) => a.type === "credit_card" || a.type === "cash")
            .map((a) => (
              <DestChip key={a.id} active={destination.kind === "account" && destination.id === a.id} onClick={() => setDestination({ kind: "account", id: a.id })} icon={<Wallet className="size-3.5" />} color="#AEB4BD">
                {a.type === "credit_card" ? "Pagar fatura" : a.name}
              </DestChip>
            ))}
        </div>
      )}

      {type === "investment" && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Classe do investimento">
          {CLASSES.map((c) => (
            <DestChip key={c.value} active={investmentClass === c.value} onClick={() => setInvestmentClass(c.value)} icon={<TrendingUp className="size-3.5" />} color="#5B8CFF">
              {c.label}
            </DestChip>
          ))}
        </div>
      )}

      {/* Calculator */}
      {(!keyboardMode || !touchDevice) && <Keypad onKey={onKey} />}

      {/* Progressive disclosure */}
      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        aria-expanded={showMore}
        className="flex items-center justify-between rounded-[14px] px-1 py-1 text-[14px] text-soft hover:text-off"
      >
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4" />
          {formatRelativeDay(date, today)} · {state.accounts.find((a) => a.id === accountId)?.name}
          {recurring !== "none" && ` · ${RECURRENCE.find((r) => r.value === recurring)!.label}`}
        </span>
        <span className="flex items-center gap-1 text-[13px] font-medium">
          Mais detalhes
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {showMore && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 pb-1">
              <div className="col-span-2">
                <Field label="Descrição">
                  <input
                    className={inputClass}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDescTouched(true);
                    }}
                    placeholder={effectiveCategory ? getCategory(effectiveCategory).name : "Descrição"}
                  />
                </Field>
              </div>
              <Field label="Data">
                <div className="flex gap-1.5">
                  <input type="date" className={cn(inputClass, "px-3 [color-scheme:dark]")} value={date} max={addDays(today, 365)} onChange={(e) => e.target.value && setDate(e.target.value)} />
                </div>
              </Field>
              <Field label={type === "expense" ? "Pago com" : "Conta"}>
                <select className={cn(inputClass, "px-3")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Repetição">
                <select className={cn(inputClass, "px-3")} value={recurring} onChange={(e) => setRecurring(e.target.value as Recurrence)}>
                  {RECURRENCE.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              {type === "expense" && !edit ? (
                <Field label="Parcelas" hint={installments ? `${installments}× de ${formatBRL(finalAmount)}` : undefined}>
                  <select
                    className={cn(inputClass, "px-3")}
                    value={installments ?? 1}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n > 1 && !splitSuggestion && amount > 0) {
                        // Convert the current total into "total / n" so the calculator shows the split.
                        setText(`${formatNumber(amount, 2).replace(/,00$/, "")} ÷ ${n}`);
                      } else if (n > 1 && splitSuggestion) {
                        setText(`${formatNumber(splitSuggestion.total, 2).replace(/,00$/, "")} ÷ ${n}`);
                      }
                      setInstallments(n > 1 ? n : undefined);
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "À vista" : `${n}×`}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div />
              )}
              <div className="col-span-2">
                <Field label="Tags" hint="Separe por vírgulas">
                  <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="delivery, trabalho" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Notas">
                  <textarea className={cn(inputClass, "h-20 resize-none py-3")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky bottom-0 -mx-5 flex gap-2 bg-gradient-to-t from-[#0e1115] via-[#0e1115] to-transparent px-5 pt-3">
        {edit && (
          <button type="button" onClick={remove} className="pressable grid size-14 shrink-0 place-items-center rounded-[16px] bg-coral/12 text-coral-light" aria-label="Excluir movimentação">
            <Trash2 className="size-5" />
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={finalAmount <= 0}
          className={cn(
            "pressable h-14 flex-1 rounded-[16px] text-[16px] font-semibold transition-colors disabled:opacity-35",
            type === "investment" ? "bg-blue text-off" : type === "transfer" ? "bg-yellow text-ink" : "bg-green text-ink",
          )}
        >
          {saveLabel(type, finalAmount, !!edit, destinationLabel, installments)}
        </button>
      </div>
    </div>
  );
}

function saveLabel(type: TransactionType, amount: number, edit: boolean, dest: string, installments?: number) {
  if (edit) return "Salvar alterações";
  const v = amount > 0 ? ` ${formatBRL(amount)}` : "";
  if (type === "income") return `Registrar receita${v}`;
  if (type === "investment") return `Investir${v}`;
  if (type === "transfer") return amount > 0 ? `Guardar${v} em ${dest}` : "Guardar";
  return installments ? `Registrar ${installments}×${v}` : `Registrar gasto${v}`;
}

function DestChip({ active, onClick, icon, color, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "pressable flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[14px] font-medium",
        active ? "border-transparent text-ink" : "border-white/[0.08] bg-white/[0.03] text-soft hover:text-off",
      )}
      style={active ? { background: color } : undefined}
    >
      <span style={{ color: active ? "#050607" : color }}>{icon}</span>
      {children}
    </button>
  );
}
