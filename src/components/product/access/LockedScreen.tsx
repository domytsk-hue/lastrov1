"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import Link from "next/link";
import { CHECKOUT_ROUTE } from "@/config/routes";
import { PLAN_BENEFITS, PLANS, isPlanId } from "@/config/plans";
import { ease } from "@/design-system/motion";
import { LastroMark } from "@/components/shared/brand/LastroMark";
import { useAccess } from "./access-context";

/**
 * What a paid module shows to an account without plan access. Rendered INSTEAD of the
 * module (decided on the server), so no financial component mounts behind it.
 */
export function LockedScreen() {
  const access = useAccess();
  const reduce = useReducedMotion();
  const pending = access?.pendingOrder ?? null;
  const expired = access?.state === "expired";
  const pendingPlan = pending && isPlanId(pending.planId) ? PLANS[pending.planId] : null;

  return (
    <motion.section
      aria-labelledby="locked-title"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: ease.out }}
      className="mx-auto max-w-[720px] pt-4 lg:pt-6"
    >
      <div className="surface-hero relative overflow-hidden rounded-[40px] p-7 text-white sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <LastroMark size={64} progress={expired ? 0.5 : 0.84} tone="light" />
          <h1 id="locked-title" className="mt-7 font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[44px]">
            Seu Lastro está pronto.
          </h1>
          <p className="mt-3 max-w-[46ch] text-[17px] leading-relaxed text-white/85">
            {expired ? "Seu acesso mensal terminou. Seus dados continuam guardados — escolha um plano para voltar a usar todos os recursos." : "Escolha um plano para liberar todos os recursos."}
          </p>

          <ul className="mt-7 flex flex-col gap-2.5">
            {PLAN_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-[15px] text-white/90">
                <Check className="size-4 shrink-0 text-mint" strokeWidth={3} aria-hidden />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={CHECKOUT_ROUTE}
              className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-ink-900 shadow-[0_16px_34px_-14px_rgba(7,26,59,0.6)] transition-transform active:scale-[0.97]"
            >
              Liberar meu acesso
              <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            {pending && (
              <Link
                href={`${CHECKOUT_ROUTE}?pedido=${pending.id}`}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-midnight/35 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-midnight/50"
              >
                <Clock3 className="size-[18px]" aria-hidden />
                Acompanhar pagamento{pendingPlan ? ` · ${pendingPlan.name}` : ""}
              </Link>
            )}
          </div>
        </div>
      </div>
      <p className="mt-5 px-2 text-center text-[14px] text-ink-500">Sua conta e seus dados continuam disponíveis no seu perfil.</p>
    </motion.section>
  );
}
