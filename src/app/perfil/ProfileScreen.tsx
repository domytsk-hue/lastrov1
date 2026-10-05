"use client";

import { ChevronRight, Eye, Fingerprint, KeyRound, Landmark, RotateCcw, Shapes, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/data/categories";
import { evaluate } from "@/lib/calculator";
import { cn } from "@/lib/cn";
import { lastroLevel, lastroScore, streak } from "@/lib/finance";
import { formatMonthYear, formatNumber } from "@/lib/format";
import type { User } from "@/lib/types";
import { useFinance } from "@/store/finance-store";
import { useUI } from "@/store/ui-store";
import { LastroMark } from "@/components/shell/LastroMark";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Button, Field, PageHeader, inputClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

const OBJECTIVES: { value: User["objective"]; label: string }[] = [
  { value: "organize", label: "Organizar meu dinheiro" },
  { value: "reserve", label: "Construir reserva de emergência" },
  { value: "debt", label: "Sair das dívidas" },
  { value: "goal", label: "Juntar para uma meta" },
  { value: "invest", label: "Começar a investir" },
  { value: "wealth", label: "Fazer meu patrimônio crescer" },
];

export function ProfileScreen() {
  const { state, today, resetDemo } = useFinance();
  const { privacy, togglePrivacy } = useUI();
  const toast = useToast();
  const [sheet, setSheet] = useState<"profile" | "categories" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { score } = lastroScore(state, today);
  const s = streak(state, today);

  return (
    <>
      <PageHeader eyebrow="Perfil" title={state.user.name} />

      <section className="card-raised mb-6 flex items-center gap-5 p-5">
        <LastroMark size={64} progress={score / 100} />
        <div className="flex-1">
          <p className="text-[13px] text-soft">Lastro {score} · Nível {lastroLevel(score).name}</p>
          <p className="mt-1 text-[14px] text-muted">
            No Lastro desde {formatMonthYear(state.user.memberSince)} · {s} {s === 1 ? "dia" : "dias"} seguidos
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Group title="Você">
          <Row icon={<Target className="size-[18px]" />} label="Objetivo e renda" value={OBJECTIVES.find((o) => o.value === state.user.objective)?.label} onClick={() => setSheet("profile")} />
          <Row icon={<Landmark className="size-[18px]" />} label="Contas" value={`${state.accounts.length} contas`} href="/movimentacoes?aba=contas" />
          <Row icon={<Shapes className="size-[18px]" />} label="Categorias" value={`${EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length}`} onClick={() => setSheet("categories")} />
        </Group>

        <Group title="Preferências">
          <li>
            <button onClick={togglePrivacy} role="switch" aria-checked={privacy} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="grid size-9 place-items-center rounded-[12px] bg-white/[0.05] text-soft">
                <Eye className="size-[18px]" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-medium">Ocultar valores</span>
                <span className="text-[13px] text-muted">Para abrir o app em público</span>
              </span>
              <span className={cn("relative h-7 w-12 rounded-full transition-colors", privacy ? "bg-green" : "bg-white/15")}>
                <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-transform", privacy ? "translate-x-6" : "translate-x-1")} />
              </span>
            </button>
          </li>
        </Group>

        <Group title="Segurança">
          <Row icon={<Fingerprint className="size-[18px]" />} label="Desbloqueio por biometria" value="Em breve" disabled />
          <Row icon={<KeyRound className="size-[18px]" />} label="Seus dados" value="Salvos só neste aparelho" disabled />
        </Group>

        <Group title="Demonstração">
          <li className="px-4 py-3.5">
            {confirmReset ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] text-soft">Apagar suas alterações e voltar aos dados do Lucas?</p>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    resetDemo();
                    setConfirmReset(false);
                    toast.show({ title: "Dados de demonstração restaurados", tone: "neutral" });
                  }}
                >
                  Restaurar
                </Button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="flex w-full items-center gap-3 text-left">
                <span className="grid size-9 place-items-center rounded-[12px] bg-white/[0.05] text-soft">
                  <RotateCcw className="size-[18px]" />
                </span>
                <span className="flex-1 text-[15px] font-medium">Restaurar dados de demonstração</span>
              </button>
            )}
          </li>
        </Group>
      </div>

      <BottomSheet open={sheet === "profile"} onClose={() => setSheet(null)} title="Objetivo e renda">
        {sheet === "profile" && <ProfileForm onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet open={sheet === "categories"} onClose={() => setSheet(null)} title="Categorias">
        <p className="eyebrow mb-2">Gastos</p>
        <ul className="mb-5 grid grid-cols-2 gap-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.03] p-2.5 text-[14px]">
              <CategoryIcon id={c.id} size={32} />
              {c.name}
            </li>
          ))}
        </ul>
        <p className="eyebrow mb-2">Receitas</p>
        <ul className="grid grid-cols-2 gap-2">
          {INCOME_CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.03] p-2.5 text-[14px]">
              <CategoryIcon id={c.id} size={32} />
              {c.name}
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-2 px-1">{title}</h2>
      <ul className="card divide-y divide-white/[0.05] overflow-hidden">{children}</ul>
    </section>
  );
}

function Row({ icon, label, value, onClick, href, disabled }: { icon: React.ReactNode; label: string; value?: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span className="grid size-9 place-items-center rounded-[12px] bg-white/[0.05] text-soft">{icon}</span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      {value && <span className="max-w-[45%] truncate text-[13px] text-muted">{value}</span>}
      {!disabled && <ChevronRight className="size-4 text-muted" />}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : (
        <button onClick={onClick} disabled={disabled} className={cn(cls, "disabled:hover:bg-transparent")}>
          {inner}
        </button>
      )}
    </li>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useFinance();
  const toast = useToast();
  const [name, setName] = useState(state.user.name);
  const [income, setIncome] = useState(formatNumber(state.user.monthlyIncome, 0));
  const [objective, setObjective] = useState(state.user.objective);
  const incomeValue = evaluate(income)?.value ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Renda mensal">
        <input className={inputClass} inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-soft">Objetivo principal</p>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Objetivo principal">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={objective === o.value}
              onClick={() => setObjective(o.value)}
              className={cn("rounded-[14px] px-4 py-3 text-left text-[14px] font-medium", objective === o.value ? "bg-green/15 text-green ring-1 ring-green/40" : "bg-white/[0.04] text-soft")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        size="lg"
        disabled={!name.trim() || incomeValue <= 0}
        onClick={() => {
          dispatch({ type: "user/set", patch: { name: name.trim(), monthlyIncome: incomeValue, objective } });
          toast.show({ title: "Perfil atualizado" });
          onDone();
        }}
      >
        Salvar
      </Button>
    </div>
  );
}
