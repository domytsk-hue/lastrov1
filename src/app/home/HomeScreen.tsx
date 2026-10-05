"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FinancialHero } from "@/components/home/FinancialHero";
import { DailyPulse } from "@/components/home/DailyPulse";
import { LastroScoreCard } from "@/components/home/LastroScore";
import { BudgetSnapshot, GoalsStrip, HomeHeader, InsightCard, QuickActions, RecentTransactions } from "@/components/home/HomeSections";
import { NetWorthCard } from "@/components/grow/NetWorthCard";

/** Staggered entrance: the page "assembles" itself, once. */
function Reveal({ children, i, className }: { children: React.ReactNode; i: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function HomeScreen() {
  return (
    <>
      <HomeHeader />
      {/* Mobile: one column in the order of the daily loop. Desktop: two columns with rhythm. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <Reveal i={0}>
            <FinancialHero />
          </Reveal>
          <Reveal i={1} className="lg:hidden">
            <QuickActions />
          </Reveal>
          <Reveal i={2}>
            <LastroScoreCard />
          </Reveal>
          <Reveal i={3} className="lg:hidden">
            <DailyPulse />
          </Reveal>
          <Reveal i={4}>
            <GoalsStrip />
          </Reveal>
          <Reveal i={5} className="hidden lg:block">
            <NetWorthCard />
          </Reveal>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Reveal i={1} className="hidden lg:block">
            <DailyPulse />
          </Reveal>
          <Reveal i={2} className="hidden lg:block">
            <QuickActions />
          </Reveal>
          <Reveal i={5}>
            <InsightCard />
          </Reveal>
          <Reveal i={6}>
            <BudgetSnapshot />
          </Reveal>
          <Reveal i={7}>
            <RecentTransactions />
          </Reveal>
        </div>
      </div>
    </>
  );
}
