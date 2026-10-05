"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { categoryAverage, reserveStatus } from "@/product/domain/finance";
import { formatBRL, formatNumber } from "@/lib/format";
import type { Lesson } from "@/product/domain/types";
import { useFinance } from "@/product/store/finance-store";
import { BottomSheet } from "@/components/shared/ui/BottomSheet";
import { Button } from "@/components/shared/ui/primitives";
import { ROUTES } from "@/config/routes";

/**
 * "Quanto de reserva você precisa?" — a short, visual, interactive lesson that ends with
 * a real calculation on the user's own numbers. Education connected to action.
 */
export function LessonSheet({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
  return (
    <BottomSheet open={!!lesson} onClose={onClose} title={lesson?.title ?? ""} description={lesson ? `${lesson.category} · ${lesson.minutes} min` : undefined} size="lg">
      {lesson && <ReserveLesson key={lesson.id} onClose={onClose} />}
    </BottomSheet>
  );
}

function ReserveLesson({ onClose }: { onClose: () => void }) {
  const { state, today, dispatch } = useFinance();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<"clt" | "autonomo" | "publico" | null>(null);

  const essential = useMemo(
    () => (["moradia", "alimentacao", "transporte", "saude", "educacao"] as const).reduce((s, c) => s + categoryAverage(state, c, today), 0),
    [state, today],
  );
  const months = profile === "autonomo" ? 12 : profile === "publico" ? 3 : 6;
  const target = Math.round(essential / 50) * 50 * months;
  const r = reserveStatus(state, today);

  const steps = [
    {
      title: "Reserva não é investimento para render.",
      body: "É o que separa um imprevisto de uma dívida. Ela precisa estar disponível no mesmo dia, com baixo risco — como Tesouro Selic ou CDB de liquidez diária.",
    },
    {
      title: "A conta usa o custo essencial, não a renda.",
      body: `Some só o que não dá para cortar: moradia, mercado, transporte, saúde, educação. Pelo seu histórico, isso dá cerca de ${formatBRL(essential, { cents: false })} por mês.`,
    },
    {
      title: "Quantos meses depende da sua estabilidade.",
      body: "Qual dessas descreve melhor sua renda?",
      choice: true,
    },
  ];

  const done = step >= steps.length;

  return (
    <div className="flex min-h-[360px] flex-col">
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {[...steps, null].map((_, i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-electric" : "bg-ink-900/10")} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }} className="flex flex-1 flex-col">
            <p className="font-display text-[24px] leading-tight font-semibold tracking-[-0.02em]">{steps[step].title}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{steps[step].body}</p>
            {steps[step].choice && (
              <div className="mt-5 flex flex-col gap-2" role="radiogroup" aria-label="Tipo de renda">
                {(
                  [
                    ["publico", "Servidor público", "3 meses costumam bastar"],
                    ["clt", "CLT", "6 meses é o recomendado"],
                    ["autonomo", "Autônomo ou PJ", "12 meses dão tranquilidade"],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={profile === id}
                    onClick={() => setProfile(id)}
                    className={cn("flex items-center justify-between rounded-[24px] p-4 text-left transition-transform active:scale-[0.98]", profile === id ? "bg-midnight text-white" : "bg-white text-ink-900 shadow-[0_6px_16px_-12px_rgba(22,80,180,0.5)]")}
                  >
                    <span>
                      <span className="block text-[15px] font-semibold">{label}</span>
                      <span className={cn("text-[14px]", profile === id ? "text-white/70" : "text-ink-500")}>{hint}</span>
                    </span>
                    {profile === id && <Check className="size-5 text-mint" />}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-auto pt-6">
              <Button className="w-full" size="lg" disabled={!!steps[step].choice && !profile} onClick={() => setStep((s) => s + 1)}>
                {step === steps.length - 1 ? "Calcular a minha" : "Continuar"}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="flex flex-1 flex-col">
            <p className="eyebrow text-electric">Sua reserva ideal</p>
            <p className="mt-2 font-display text-[44px] leading-none font-semibold tracking-[-0.04em] tabular">{formatBRL(target, { cents: false })}</p>
            <p className="mt-3 text-[16px] text-ink-700">
              {months} meses × {formatBRL(Math.round(essential / 50) * 50, { cents: false })} de custo essencial.
            </p>
            <div className="mt-5 rounded-[24px] bg-white p-4">
              <p className="text-[15px] leading-snug">
                Você já tem <strong className="text-mint-ink">{formatBRL(r.balance, { cents: false })}</strong> — {formatNumber(Math.min(100, (r.balance / Math.max(1, target)) * 100), 0)}% do caminho.
              </p>
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-6">
              <Button
                size="lg"
                onClick={() => {
                  dispatch({ type: "reserve/set", patch: { monthlyCost: Math.round(essential / 50) * 50, targetMonths: months } });
                  dispatch({ type: "lesson/complete", id: "reserva-ideal" });
                  onClose();
                }}
              >
                Usar como minha meta
              </Button>
              <Link href={ROUTES.reserva} onClick={() => { dispatch({ type: "lesson/complete", id: "reserva-ideal" }); onClose(); }} className="flex h-12 items-center justify-center gap-1.5 text-[15px] font-semibold text-ink-700 hover:text-ink-900">
                Ver minha reserva <ArrowRight className="size-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
