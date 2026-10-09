import { Suspense } from "react";
import { DailyDemo } from "./DailyDemo";
import { FinancialFragmentation } from "./FinancialFragmentation";
import { FinalCTA, PricingSection, ProductComparison, Testimonials, TrustSection } from "./Closing";
import { Hero } from "./Hero";
import { LastroOrbitShowcase } from "./LastroOrbitShowcase";
import { MonthStory } from "./MonthStory";
import { BudgetShowcase, EducationMoment, GoalShowcase, InvestmentShowcase, NetWorthShowcase, ReserveShowcase } from "./Showcases";

/**
 * The Lastro landing, told as a journey:
 *   "Oh, isso é diferente."  → Hero, fragmentation
 *   "Entendi."               → month, Orbit, daily demo
 *   "Resolveria meu problema." → budget, reserve, goals, net worth, investments, learning
 *   "Quero testar."          → comparison, trust, plans, final CTA
 */
export function LandingPage() {
  // Each section below the hero is its own Suspense boundary: React hydrates them one by one,
  // yielding to taps in between (and hydrating first whatever the visitor touches), instead of
  // blocking a slow phone for the whole page at once. The HTML is the same.
  const sections = [
    FinancialFragmentation, MonthStory, LastroOrbitShowcase, DailyDemo, BudgetShowcase, ReserveShowcase, GoalShowcase,
    NetWorthShowcase, InvestmentShowcase, EducationMoment, ProductComparison, Testimonials, TrustSection, PricingSection, FinalCTA,
  ];
  return (
    <>
      <Hero />
      {sections.map((Section, i) => (
        <Suspense key={i}>
          <Section />
        </Suspense>
      ))}
    </>
  );
}
