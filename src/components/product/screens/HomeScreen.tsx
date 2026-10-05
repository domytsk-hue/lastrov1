"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BlueHero } from "@/components/product/home/BlueHero";
import { BudgetPreview } from "@/components/product/home/BudgetPreview";
import { GoalShelf, Greeting, NetWorthStory, RecentMoves } from "@/components/product/home/HomeStory";
import { InsightStory } from "@/components/product/home/InsightStory";
import { LastroOrbit } from "@/components/product/home/LastroOrbit";
import { PulseCard } from "@/components/product/home/PulseCard";
import { STAGGER, spring } from "@/design-system/motion";

/** Entrance: greeting 0ms → hero 80 → state 160 → orbit 240 → pulse 320 → insight 400. */
function Enter({ step, children, className }: { step: number; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: step * STAGGER }}>
      {children}
    </motion.div>
  );
}

/**
 * Home is a vertical financial story, not a grid:
 * state → today → foundation → what to know → what can I spend → goals → movement → growth.
 * On desktop it becomes a composed canvas with controlled asymmetry.
 */
export function HomeScreen() {
  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <Enter step={0}>
        <Greeting />
      </Enter>

      {/* Act 1 — the money, and today */}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-start lg:gap-8">
        <Enter step={1} className="lg:col-span-8">
          <BlueHero />
        </Enter>
        <Enter step={4} className="lg:col-span-4 lg:mt-24">
          <PulseCard />
        </Enter>
      </div>

      {/* Act 2 — the foundation, and one thing to know */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
        <Enter step={3} className="lg:col-span-6 lg:-ml-4">
          <LastroOrbit />
        </Enter>
        <Enter step={5} className="lg:col-span-6 lg:col-start-7">
          <InsightStory />
        </Enter>
      </div>

      {/* Act 3 — what I can still spend */}
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <Enter step={6} className="lg:col-span-5 lg:col-start-2">
          <BudgetPreview />
        </Enter>
        <Enter step={7} className="lg:col-span-5 lg:col-start-7 lg:mt-14">
          <NetWorthStory />
        </Enter>
      </div>

      {/* Act 4 — what I'm building */}
      <Enter step={8}>
        <GoalShelf />
      </Enter>

      {/* Act 5 — what happened */}
      <Enter step={8} className="lg:mx-auto lg:w-full lg:max-w-[760px]">
        <RecentMoves />
      </Enter>
    </div>
  );
}
