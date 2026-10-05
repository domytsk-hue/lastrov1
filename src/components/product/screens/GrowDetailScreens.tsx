"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFinance } from "@/product/store/finance-store";
import { LessonSheet } from "@/components/product/grow/LessonSheet";
import { Academy, FinancialTimelineSection, Investments, Missions, NetWorth } from "@/components/product/grow/GrowSections";
import { PageHeader } from "@/components/shared/ui/primitives";
import { StoryTitle } from "@/components/shared/surfaces/Surface";

/**
 * Focused pages for each part of Crescer. They reuse the exact sections of the Crescer hub
 * (src/components/product/grow/GrowSections) — same UI, their own URL.
 */

export function PatrimonioScreen() {
  return (
    <>
      <PageHeader eyebrow="Crescer" title="Patrimônio" />
      <div className="flex flex-col gap-14">
        <NetWorth />
        <section aria-labelledby="timeline-title">
          <StoryTitle id="timeline-title" title="Sua história" kicker="Patrimônio mês a mês" />
          <FinancialTimelineSection />
        </section>
      </div>
    </>
  );
}

export function InvestimentosScreen() {
  return (
    <>
      <PageHeader eyebrow="Crescer" title="Investimentos" />
      <Investments />
    </>
  );
}

export function AulasScreen() {
  const { state } = useFinance();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lesson = state.lessons.find((l) => l.id === params.get("aula") && l.available) ?? null;
  return (
    <>
      <PageHeader eyebrow="Crescer" title="Aulas" />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <Academy onOpen={(id) => router.replace(`${pathname}?aula=${id}`, { scroll: false })} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <Missions />
        </div>
      </div>
      <LessonSheet lesson={lesson} onClose={() => router.replace(pathname, { scroll: false })} />
    </>
  );
}
