"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Car, Check, RotateCcw, Ticket, Utensils, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";
import { ease, spring } from "@/design-system/motion";
import { Orbit } from "@/components/shared/data-viz/Orbit";
import { AnimatedMoney } from "@/components/shared/motion/AnimatedNumber";
import { CurvedGauge } from "@/components/shared/surfaces/CurvedGauge";
import { FinancialSurface } from "@/components/shared/surfaces/Surface";
import { DEMO, DEMO_DIMENSIONS } from "./demo-data";
import { Section, SectionHeading } from "./motion";

type CatId = "alimentacao" | "transporte" | "lazer";

/** Same names, icons and colors as the product's categories. */
const CATS: Record<CatId, { name: string; icon: LucideIcon; color: string; limit: number; spent: number; label: string }> = {
  alimentacao: { name: "Alimentação", icon: Utensils, color: "#12B886", limit: 900, spent: 620, label: "Almoço" },
  transporte: { name: "Transporte", icon: Car, color: "#3678F5", limit: 600, spent: 266, label: "Uber" },
  lazer: { name: "Lazer", icon: Ticket, color: "#E89A0C", limit: 350, spent: 120, label: "Cinema" },
};
const AMOUNTS = [45, 89, 120];

interface Entry {
  id: number;
  amount: number;
  cat: CatId;
}

/**
 * A safe, local demonstration of the daily loop: register an example expense and watch
 * balance, daily capacity, Pulso, the category budget and the Orbit respond — the same way
 * they do in the app. Nothing is stored; there is no account involved.
 */
export function DailyDemo() {
  const reduce = useReducedMotion();
  const [amount, setAmount] = useState(45);
  const [cat, setCat] = useState<CatId>("alimentacao");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [flying, setFlying] = useState<{ id: number; text: string; left: number; top: number; dx: number; dy: number } | null>(null);
  const [glow, setGlow] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const saveBtn = useRef<HTMLButtonElement>(null);
  const balanceRef = useRef<HTMLDivElement>(null);

  const spentTotal = entries.reduce((s, e) => s + e.amount, 0);
  const spentIn = (c: CatId) => CATS[c].spent + entries.filter((e) => e.cat === c).reduce((s, e) => s + e.amount, 0);
  const balance = DEMO.available - spentTotal;
  const dailyBefore = DEMO.freeThisMonth / DEMO.daysLeft;
  const daily = Math.max(0, DEMO.freeThisMonth - spentTotal) / DEMO.daysLeft;
  const today = DEMO.todaySpent + spentTotal;
  const c = CATS[cat];
  const catSpent = spentIn(cat);
  const catFree = c.limit - catSpent;
  const orcHealth = Math.max(0.15, 0.93 - (spentTotal / DEMO.freeThisMonth) * 0.9);
  const last = entries[entries.length - 1];

  const save = () => {
    const id = Date.now();
    const b = saveBtn.current?.getBoundingClientRect();
    const t = balanceRef.current?.getBoundingClientRect();
    if (b && t && !reduce) {
      setFlying({ id, text: `−${formatBRL(amount, { cents: false })}`, left: b.left + b.width / 2, top: b.top, dx: t.left + 90 - (b.left + b.width / 2), dy: t.top + 40 - (b.top + b.height / 2) });
    }
    window.setTimeout(
      () => {
        setEntries((xs) => [...xs, { id, amount, cat }]);
        setGlow(true);
        window.setTimeout(() => setGlow(false), 700);
      },
      reduce ? 0 : 520,
    );
    if ("vibrate" in navigator) navigator.vibrate?.([8, 40, 12]);
  };

  // The orçamento is one of six dimensions, so a single expense nudges the Lastro gently.
  const score = Math.round(DEMO.score - ((0.93 - orcHealth) * 100) / DEMO_DIMENSIONS.length);
  const orbitData = DEMO_DIMENSIONS.map(({ id, label, value, color, colorTo }) => ({ id, label, value: id === "orcamento" ? orcHealth : value, color, colorTo }));

  return (
    <Section id="como-funciona" labelledBy="daily-title">
      <SectionHeading
        id="daily-title"
        kicker="Todo dia"
        title={
          <>
            Seu dinheiro muda todo dia.
            <br className="hidden sm:block" /> O Lastro acompanha.
          </>
        }
        lead="Experimente: registre um gasto de exemplo e veja tudo se ajustar."
      />

      <div ref={stage} className="relative mt-12 grid gap-6 lg:mt-16 lg:grid-cols-12 lg:items-start">
        {/* Composer — the app's ice-blue sheet, reduced to its essentials */}
        <div className="rounded-[40px] bg-gradient-to-b from-[#EAF6FF] to-[#CDE9FF] p-6 shadow-[0_30px_70px_-34px_rgba(7,26,59,0.6)] lg:col-span-5">
          <p className="eyebrow text-ink-500">Registrar gasto</p>
          <p className="mt-3 flex items-start font-display font-semibold text-ink-900 tabular" aria-live="polite">
            <span className="mt-[0.5em] mr-2 font-sans text-[20px] font-medium opacity-60">R$</span>
            <span className="text-[64px] leading-none tracking-[-0.05em]">{amount}</span>
            <span className="mt-[0.15em] text-[28px] opacity-50">,00</span>
          </p>

          <fieldset className="mt-5">
            <legend className="sr-only">Valor</legend>
            <div className="flex gap-2">
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  aria-pressed={amount === a}
                  className={cn("h-12 flex-1 rounded-[20px] font-display text-[18px] font-semibold transition-colors", amount === a ? "bg-midnight text-white" : "bg-white text-ink-900 shadow-[0_8px_18px_-12px_rgba(22,80,180,0.55)]")}
                >
                  {a}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-3">
            <legend className="sr-only">Categoria</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATS) as CatId[]).map((id) => {
                const k = CATS[id];
                const active = cat === id;
                return (
                  <motion.button
                    key={id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCat(id)}
                    aria-pressed={active}
                    className={cn("relative flex h-11 items-center gap-2 rounded-full pr-4 pl-1.5 text-[14px] font-semibold", active ? "text-white" : "bg-white text-ink-700 shadow-[0_6px_16px_-10px_rgba(22,80,180,0.45)]")}
                  >
                    {active && <motion.span layoutId="demo-cat" className="absolute inset-0 rounded-full bg-midnight" transition={spring.snappy} />}
                    <span className="relative grid size-8 place-items-center rounded-full" style={{ background: active ? k.color : `${k.color}24`, color: active ? "#fff" : k.color }}>
                      <k.icon className="size-4" />
                    </span>
                    <span className="relative">{k.name}</span>
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          <motion.button
            ref={saveBtn}
            onClick={save}
            whileTap={{ scale: 0.96 }}
            transition={spring.snappy}
            className="mt-6 h-16 w-full rounded-full bg-mint text-[17px] font-semibold text-midnight shadow-[0_14px_30px_-14px_rgba(24,224,174,0.9)]"
          >
            Salvar gasto · {formatBRL(amount)}
          </motion.button>
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-500">
            <span>Demonstração: nada é salvo.</span>
            {entries.length > 0 && (
              <button onClick={() => setEntries([])} className="inline-flex items-center gap-1.5 font-semibold text-ink-700 hover:text-ink-900">
                <RotateCcw className="size-3.5" /> Recomeçar
              </button>
            )}
          </div>
        </div>

        {/* What changes — the app's surfaces, live */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div ref={balanceRef} className="relative">
            <FinancialSurface tone="hero" radius="xl" className="p-6">
              <AnimatePresence>
                {glow && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{ background: "radial-gradient(60% 60% at 25% 35%, rgba(255,255,255,0.4), transparent)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[15px] font-medium text-white/80">Disponível</p>
                  <AnimatedMoney value={balance} size="hero" className="mt-1 text-white" />
                </div>
                <div className="surface-glass rounded-[24px] px-4 py-3 text-white">
                  <p className="text-[13px] text-white/75">Você pode gastar</p>
                  <p className="font-display text-[22px] font-semibold tabular">
                    {entries.length > 0 && <span className="mr-2 text-[15px] text-white/55 line-through">{formatBRL(dailyBefore, { cents: false })}</span>}
                    ≈ <AnimatedMoney value={Math.round(daily)} size="md" cents={false} />
                    <span className="text-[15px] font-medium text-white/75">/dia</span>
                  </p>
                </div>
              </div>
            </FinancialSurface>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FinancialSurface tone="light" radius="organic" className="p-5">
              <span className="flex items-center gap-2">
                <span className="live-dot size-2 rounded-full bg-mint" />
                <span className="eyebrow text-ink-500">Pulso · hoje</span>
              </span>
              <AnimatedMoney value={today} size="lg" className="mt-3 text-ink-900" />
              <p className="mt-2 font-display text-[17px] leading-tight font-semibold text-ink-900">{spentTotal === 0 ? "Hoje você está no ritmo." : spentTotal > 100 ? "Hoje pediu um pouco mais." : "Ainda no seu ritmo."}</p>
            </FinancialSurface>

            <FinancialSurface tone="light" radius="organicR" className="p-5">
              <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] uppercase" style={{ color: c.color }}>
                <c.icon className="size-4" /> {c.name}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <AnimatedMoney value={Math.abs(catFree)} size="lg" cents={false} className={catFree < 0 ? "text-rose-ink" : "text-ink-900"} />
                  <p className="text-[14px] font-medium text-ink-700">{catFree < 0 ? "acima do plano" : "livres"}</p>
                </div>
                <CurvedGauge value={catSpent / c.limit} size={86} color={c.color} />
              </div>
            </FinancialSurface>
          </div>

          <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
            <div className="mx-auto w-[200px]">
              <Orbit
                data={orbitData}
                selected="orcamento"
                onSelect={() => {}}
                breathe={false}
                ariaLabel="Lastro de exemplo, destacando o orçamento"
                center={
                  <span className="flex flex-col items-center">
                    <span className="font-display text-[34px] leading-none font-semibold text-ink-900">{score}</span>
                    <span className="mt-1 text-[11px] font-semibold text-ink-500">Seu Lastro</span>
                  </span>
                }
              />
            </div>
            <div aria-live="polite" className="min-h-[72px]">
              <AnimatePresence mode="wait">
                {last ? (
                  <motion.div key={last.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: ease.out }} className="flex items-center gap-3 rounded-[28px] bg-midnight p-3 pr-5 text-white">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint text-midnight">
                      <Check className="size-4" strokeWidth={2.5} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold">
                        {CATS[last.cat].name}: {formatBRL(CATS[last.cat].limit - spentIn(last.cat), { cents: false })} livres
                      </span>
                      <span className="text-[14px] text-white/70">
                        Por dia: {formatBRL(dailyBefore, { cents: false })} → {formatBRL(daily, { cents: false })}
                      </span>
                    </span>
                  </motion.div>
                ) : (
                  <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[16px] text-ink-700">
                    Cada gasto atualiza o saldo, o quanto você pode gastar por dia, o Pulso, o orçamento e o seu Lastro.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* money flying from the button to the balance */}
        <AnimatePresence>
          {flying && (
            <motion.span
              key={flying.id}
              aria-hidden
              className="pointer-events-none fixed z-50 inline-flex h-10 items-center rounded-full bg-midnight px-4 font-display text-[17px] font-semibold text-white shadow-[0_14px_30px_-10px_rgba(7,26,59,0.55)]"
              style={{ left: flying.left, top: flying.top }}
              initial={{ x: "-50%", y: 0, opacity: 0, scale: 0.85 }}
              animate={{ x: ["-50%", "-50%", `calc(-50% + ${flying.dx}px)`], y: [0, -28, flying.dy], opacity: [0, 1, 0], scale: [0.85, 1.05, 0.6] }}
              transition={{ duration: 0.75, times: [0, 0.3, 1], ease: [0.65, 0, 0.35, 1] }}
              onAnimationComplete={() => setFlying(null)}
            >
              {flying.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
}
