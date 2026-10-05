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
  return (
    <>
      <Hero />
      <FinancialFragmentation />
      <MonthStory />
      <LastroOrbitShowcase />
      <DailyDemo />
      <BudgetShowcase />
      <ReserveShowcase />
      <GoalShowcase />
      <NetWorthShowcase />
      <InvestmentShowcase />
      <EducationMoment />
      <ProductComparison />
      <Testimonials />
      <TrustSection />
      <PricingSection />
      <FinalCTA />
    </>
  );
}
