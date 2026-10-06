"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MARKETING_ROUTES, PRODUCT_BASE } from "@/config/routes";
import { ease, press, STAGGER } from "@/design-system/motion";
import { LastroMark } from "@/components/shared/brand/LastroMark";
import { OffRouteOrbit } from "@/components/shared/data-viz/OffRouteOrbit";
import { SecondaryLink } from "@/components/marketing/ui";

const MotionLink = motion.create(Link);

/**
 * "Você saiu da rota." — the 404 as a small Lastro moment: the Orbit with one segment
 * off its path, a calm headline and the way back. No session or finance state is read:
 * "Ir para o Lastro" points at /app, which sends signed-out visitors to the login.
 */
export function NotFoundView() {
  const reduce = useReducedMotion();
  const enter = (step: number) =>
    ({
      initial: reduce ? false : { opacity: 0, y: 14 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.7, ease: ease.out, delay: 0.1 + step * STAGGER * 1.5 },
    }) as const;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center overflow-x-clip px-5 pt-8 pb-14 sm:pt-10">
      <motion.div {...enter(0)}>
        <Link href={MARKETING_ROUTES.home} className="flex items-center gap-2 rounded-full px-2 py-1" aria-label="Lastro — página inicial">
          <LastroMark size={28} />
          <span className="font-display text-[21px] font-semibold tracking-[-0.03em] text-ink-900">lastro</span>
        </Link>
      </motion.div>

      <main className="flex w-full max-w-[640px] flex-1 flex-col items-center justify-center text-center">
        <motion.div {...enter(1)} className="mt-8 w-[min(300px,74vw)] sm:mt-10 sm:w-[320px]">
          <OffRouteOrbit>
            <span className="flex flex-col items-center">
              <span className="font-display text-[clamp(44px,13vw,60px)] leading-none font-semibold tracking-[-0.05em] text-ink-900">404</span>
              <span className="mt-1.5 text-[11px] font-bold tracking-[0.16em] text-ink-500 uppercase">fora da rota</span>
            </span>
          </OffRouteOrbit>
        </motion.div>

        <motion.h1
          {...enter(2)}
          className="mt-8 font-display text-[clamp(38px,7vw,64px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-ink-900 sm:mt-10"
        >
          Você saiu da rota.
        </motion.h1>
        <motion.p {...enter(3)} className="mt-4 max-w-[34ch] text-[clamp(17px,2vw,20px)] leading-snug text-pretty text-ink-700">
          Essa página não existe ou mudou de lugar.
        </motion.p>

        <motion.div {...enter(4)} className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          <MotionLink
            href={MARKETING_ROUTES.home}
            whileTap={reduce ? undefined : press}
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-midnight px-7 text-[16px] font-semibold whitespace-nowrap text-white shadow-[0_16px_34px_-14px_rgba(7,26,59,0.85)] transition-colors hover:bg-deep"
          >
            <ArrowLeft className="size-[18px] transition-transform group-hover:-translate-x-0.5" aria-hidden />
            Voltar para o início
          </MotionLink>
          <SecondaryLink href={PRODUCT_BASE}>Ir para o Lastro</SecondaryLink>
        </motion.div>
      </main>
    </div>
  );
}
