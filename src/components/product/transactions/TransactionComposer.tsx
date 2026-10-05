"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { CalendarDays, ChevronDown, Keyboard, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from "@/product/data/categories";
import { evaluate, isArithmetic } from "@/product/domain/calculator";
import { cn } from "@/lib/cn";
import { feedbackFor } from "@/product/domain/feedback";
import { addDays, formatBRL, formatNumber, formatRelativeDay } from "@/lib/format";
import { spring } from "@/design-system/motion";
import { parseQuickEntry } from "@/product/domain/quick-entry";
import { dailyCapacity } from "@/product/domain/stories";
import type { CategoryId, InvestmentClass, Recurrence, TransactionType } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import type { TransactionInput } from "@/product/store/reducer";
import { useUI } from "@/product/store/ui-store";
import { BALANCE_TARGET } from "@/components/product/home/BlueHero";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { Field, Segmented, inputClass } from "@/components/shared/ui/primitives";
import { CategoryChip } from "@/components/product/ui/FinanceChips";
import { useToast } from "@/components/shared/ui/Toast";
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

/** <BottomComposer /> — the fastest path from "I spent" to "Lastro knows". */
export function TransactionComposer() {
  const { composer, closeComposer } = useUI();
  return (
    <BottomSheet open={!!composer} onClose={closeComposer} title={composer?.edit ? "Editar movimentação" : "Nova movimentação"} hideTitle size="md" tone="ice">
      {composer && <ComposerBody key={composer.edit?.id ?? JSON.stringify(composer)} />}
    </BottomSheet>
  );
}

function ComposerBody() {
  const { state, today, dispatch } = useFinance();
  const { composer, closeComposer, emitFlow } = useUI();
  const toast = useToast();
  const chipGroup = useId();
  const edit = composer?.edit;
  const checking = state.accounts.find((a) => a.type === "checking")!;
  const saveRef = useRef<HTMLButtonElement>(null);

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
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  /* ---------- interpretation ---------- */
  const parsed = useMemo(() => (text && !isArithmetic(text) ? parseQuickEntry(text, today) : null), [text, today]);
  const calc = useMemo(() => (text && isArithmetic(text) ? evaluate(text) : null), [text]);
  const amount = calc?.value ?? parsed?.amount ?? 0;
  const splitSuggestion = calc?.installments ?? (parsed?.installments && parsed.amount ? { total: parsed.amount, count: parsed.installments, each: parsed.amount / parsed.installments } : undefined);

  useEffect(() => {
    if (!parsed || edit) return;
    if (parsed.inferred.includes("type")) {
      setType(parsed.type);
      if (parsed.destination === "reserve") setDestination({ kind: "reserve" });
    }
    if (!categoryTouched && parsed.categoryId) setCategoryId(parsed.categoryId);
    if (!descTouched) setDescription(parsed.description);
    if (parsed.inferred.includes("date")) setDate(parsed.date);
    if (parsed.installments && /\d\s?x\b/i.test(text)) setInstallments(parsed.installments);
  }, [parsed, edit, categoryTouched, descTouched, text]);

  const finalAmount = installments && splitSuggestion ? Math.round(splitSuggestion.each * 100) / 100 : amount;

  const categoryList = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const effectiveCategory: CategoryId | undefined = type === "expense" || type === "income" ? (categoryList.some((c) => c.id === categoryId) ? categoryId : undefined) : undefined;

  const destinationLabel = (() => {
    if (type !== "transfer") return "";
    if (destination.kind === "reserve") return "Reserva de emergência";
    if (destination.kind === "goal") return state.goals.find((g) => g.id === destination.id)?.name ?? "Meta";
    return state.accounts.find((a) => a.id === destination.id)?.name ?? "Conta";
  })();

  const canSave = finalAmount > 0 && (type !== "expense" || !!effectiveCategory);

  const save = useCallback(() => {
    if (saving) return;
    if (!canSave) {
      if (finalAmount > 0 && type === "expense" && !effectiveCategory) {
        toast.show({ title: "Escolha uma categoria", body: "Assim o orçamento certo se atualiza.", tone: "neutral" });
      }
      return;
    }
    const desc =
      description.trim() ||
      (type === "expense" || type === "income" ? getCategory(effectiveCategory).name : type === "investment" ? `Aporte — ${CLASSES.find((c) => c.value === investmentClass)!.label}` : destinationLabel);

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

    if ("vibrate" in navigator) navigator.vibrate?.([8, 40, 12]);

    // Money leaves the button and travels to the balance; the state commits as it lands.
    const r = saveRef.current?.getBoundingClientRect();
    const tone = type === "income" ? "gain" : type === "expense" ? "spend" : "save";
    if (r && !edit) {
      const sign = type === "income" ? "+" : type === "expense" ? "−" : "";
      emitFlow({ text: `${sign}${formatBRL(finalAmount, { cents: finalAmount % 1 !== 0 })}`, tone, from: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, to: BALANCE_TARGET });
    }
    setSaving(true);
    const prevState = state;
    const prevIds = new Set(state.transactions.map((t) => t.id));
    const commit = () => {
      const next = edit ? dispatch({ type: "transaction/update", id: edit.id, input }) : dispatch({ type: "transaction/add", input });
      const created = next.transactions.filter((t) => !prevIds.has(t.id));
      if (edit) {
        toast.show({ title: "Movimentação atualizada" });
        return;
      }
      const fb = feedbackFor(input, next, today);
      let body = fb.body ?? "";
      const variable = type === "expense" && effectiveCategory && !getCategory(effectiveCategory).fixed;
      if (variable) {
        const before = dailyCapacity(prevState, today);
        const after = dailyCapacity(next, today);
        if (Math.round(before) !== Math.round(after)) body = `Por dia: ${formatBRL(before, { cents: false })} → ${formatBRL(after, { cents: false })}`;
      }
      if (installments && type === "expense") body = `${installments}× de ${formatBRL(finalAmount)}. ${body}`;
      toast.show({
        title: fb.title,
        body,
        tone: fb.tone,
        action: { label: "Desfazer", onClick: () => created.forEach((t) => dispatch({ type: "transaction/delete", id: t.id })) },
      });
    };
    closeComposer();
    window.setTimeout(commit, edit ? 0 : 520);
  }, [saving, canSave, finalAmount, type, effectiveCategory, description, investmentClass, destinationLabel, accountId, date, recurring, tags, notes, installments, destination, state, edit, dispatch, today, closeComposer, toast, emitFlow]);

  const remove = () => {
    if (!edit) return;
    dispatch({ type: "transaction/delete", id: edit.id });
    closeComposer();
    toast.show({ title: "Movimentação removida", tone: "neutral", action: { label: "Desfazer", onClick: () => dispatch({ type: "transaction/restore", txs: [edit] }) } });
  };

  const accent = type === "income" ? "text-mint-ink" : type === "investment" ? "text-electric" : type === "transfer" ? "text-deep" : "text-ink-900";
  const accounts = state.accounts.filter((a) => ["checking", "cash", ...(type === "expense" ? ["credit_card"] : [])].includes(a.type));
  const [intPart, decPart] = formatNumber(finalAmount, 2).split(",");

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Tipo de movimentação" value={type} onChange={setType} options={TYPE_OPTIONS} />

      {/* Amount — the hero of the sheet */}
      <div className="flex flex-col items-center pt-1 text-center" aria-live="polite">
        <motion.div key={type} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className={cn("flex items-start font-display font-semibold tabular", accent, finalAmount === 0 && "opacity-35")}>
          <span className="mt-[0.5em] mr-2 font-sans text-[22px] font-medium opacity-60">R$</span>
          <span className="text-[68px] leading-none tracking-[-0.05em]">{intPart}</span>
          <span className="mt-[0.15em] text-[30px] opacity-50">,{decPart}</span>
        </motion.div>
        <div className="mt-3 flex min-h-[32px] flex-wrap items-center justify-center gap-2">
          {calc?.isExpression && <span className="rounded-full bg-white/70 px-3 py-1 text-[15px] font-medium text-ink-700 tabular">{text.replace(/\s+$/, "")}</span>}
          {type === "expense" && splitSuggestion && (
            <button
              type="button"
              onClick={() => setInstallments((i) => (i ? undefined : splitSuggestion.count))}
              aria-pressed={!!installments}
              className={cn("rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-transform active:scale-95", installments ? "bg-electric text-white" : "bg-electric/12 text-electric")}
            >
              {installments ? "✓ " : ""}
              {splitSuggestion.count}× de {formatBRL(splitSuggestion.each)}
              {!installments && " · parcelar"}
            </button>
          )}
          {parsed && parsed.inferred.length > 0 && !calc && (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-500">
              <Sparkles className="size-4 text-violet" />
              {[parsed.amount && formatBRL(parsed.amount), effectiveCategory && getCategory(effectiveCategory).name, formatRelativeDay(date, today).toLowerCase()].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* Smart field */}
      <div className="relative">
        <Sparkles className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-violet" aria-hidden />
        <input
          ref={inputRef}
          autoFocus={!touchDevice}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          inputMode={touchDevice && !keyboardMode ? "none" : "text"}
          placeholder={type === "income" ? "3500 salário" : type === "transfer" ? "300 reserva" : "45 almoço · 120+32+48"}
          aria-label="Valor ou descrição rápida"
          className={cn(inputClass, "h-14 rounded-full pr-14 pl-12 text-[17px]")}
        />
        <button
          type="button"
          onClick={() => {
            setKeyboardMode((m) => !m);
            window.setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className={cn("absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-ink-500 lg:hidden", keyboardMode && "bg-midnight text-white")}
          aria-label={keyboardMode ? "Usar calculadora" : "Digitar texto"}
          aria-pressed={keyboardMode}
        >
          <Keyboard className="size-[18px]" />
        </button>
      </div>

      {/* What it is — chips; the selected highlight morphs between them */}
      <LayoutGroup id={chipGroup}>
        {(type === "expense" || type === "income") && (
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 no-scrollbar" role="group" aria-label="Categoria">
            {categoryList.map((c) => (
              <CategoryChip
                key={c.id}
                id={c.id}
                compact
                layoutGroup={`${chipGroup}-cat`}
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
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 no-scrollbar" role="group" aria-label="Destino">
            <DestChip group={chipGroup} active={destination.kind === "reserve"} onClick={() => setDestination({ kind: "reserve" })} icon={<ShieldCheck className="size-4" />}>
              Reserva
            </DestChip>
            {state.goals.map((g) => (
              <DestChip key={g.id} group={chipGroup} active={destination.kind === "goal" && destination.id === g.id} onClick={() => setDestination({ kind: "goal", id: g.id })} icon={<Target className="size-4" />}>
                {g.name}
              </DestChip>
            ))}
            {state.accounts
              .filter((a) => a.type === "credit_card" || a.type === "cash")
              .map((a) => (
                <DestChip key={a.id} group={chipGroup} active={destination.kind === "account" && destination.id === a.id} onClick={() => setDestination({ kind: "account", id: a.id })} icon={<Wallet className="size-4" />}>
                  {a.type === "credit_card" ? "Pagar fatura" : a.name}
                </DestChip>
              ))}
          </div>
        )}

        {type === "investment" && (
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 no-scrollbar" role="group" aria-label="Classe do investimento">
            {CLASSES.map((c) => (
              <DestChip key={c.value} group={chipGroup} active={investmentClass === c.value} onClick={() => setInvestmentClass(c.value)} icon={<TrendingUp className="size-4" />}>
                {c.label}
              </DestChip>
            ))}
          </div>
        )}
      </LayoutGroup>

      {(!keyboardMode || !touchDevice) && <Keypad onKey={(k) => setText((t) => applyKey(t, k))} />}

      {/* Progressive disclosure */}
      <button type="button" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore} className="flex items-center justify-between rounded-full px-2 py-1 text-[15px] text-ink-700">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-[18px] text-ink-500" />
          {formatRelativeDay(date, today)} · {state.accounts.find((a) => a.id === accountId)?.name}
          {recurring !== "none" && ` · ${RECURRENCE.find((r) => r.value === recurring)!.label}`}
        </span>
        <span className="flex items-center gap-1 text-[14px] font-semibold text-ink-900">
          Detalhes
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {showMore && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.soft} className="overflow-hidden">
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
                <input type="date" className={cn(inputClass, "px-3")} value={date} max={addDays(today, 365)} onChange={(e) => e.target.value && setDate(e.target.value)} />
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
                <Field label="Parcelas">
                  <select
                    className={cn(inputClass, "px-3")}
                    value={installments ?? 1}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const base = splitSuggestion ? splitSuggestion.total : amount;
                      if (n > 1 && base > 0) setText(`${formatNumber(base, 2).replace(/,00$/, "")} ÷ ${n}`);
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
                  <textarea className={cn(inputClass, "h-24 resize-none py-3")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky bottom-0 -mx-6 flex gap-2 bg-gradient-to-t from-[#CDE9FF] via-[#CDE9FF]/95 to-transparent px-6 pt-4">
        {edit && (
          <button type="button" onClick={remove} className="grid size-16 shrink-0 place-items-center rounded-full bg-rose/12 text-rose-ink transition-transform active:scale-95" aria-label="Excluir movimentação">
            <Trash2 className="size-5" />
          </button>
        )}
        <motion.button
          ref={saveRef}
          type="button"
          onClick={save}
          disabled={finalAmount <= 0}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          className={cn(
            "h-16 flex-1 rounded-full text-[17px] font-semibold shadow-[0_14px_30px_-14px_rgba(7,26,59,0.8)] disabled:opacity-35",
            type === "expense" ? "bg-mint text-midnight" : "bg-midnight text-white",
          )}
        >
          {saveLabel(type, finalAmount, !!edit, destinationLabel, installments, !!calc?.isExpression)}
        </motion.button>
      </div>
    </div>
  );
}

function saveLabel(type: TransactionType, amount: number, edit: boolean, dest: string, installments: number | undefined, expression: boolean) {
  if (edit) return "Salvar alterações";
  const v = amount > 0 ? ` · ${formatBRL(amount)}` : "";
  if (type === "income") return `Salvar receita${v}`;
  if (type === "investment") return `Investir${v}`;
  if (type === "transfer") return amount > 0 ? `Guardar em ${dest}` : "Guardar";
  if (installments) return `Salvar ${installments}×${v}`;
  return expression ? `Salvar como gasto${v}` : `Salvar gasto${v}`;
}

function DestChip({ active, onClick, icon, children, group }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; group: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileTap={{ scale: 0.95 }}
      className={cn("relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold", active ? "text-white" : "bg-white text-ink-700 shadow-[0_6px_16px_-10px_rgba(22,80,180,0.45)]")}
    >
      {active && <motion.span layoutId={`${group}-dest`} className="absolute inset-0 rounded-full bg-midnight" transition={spring.snappy} />}
      <span className="relative">{icon}</span>
      <span className="relative">{children}</span>
    </motion.button>
  );
}
