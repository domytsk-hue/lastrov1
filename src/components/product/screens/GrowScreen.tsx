"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { replaceQuery } from "@/lib/url";
import { useFinance } from "@/product/store/finance-store";
import { LessonSheet } from "@/components/product/grow/LessonSheet";
import { Academy, FinancialTimelineSection, InsightsList, Investments, Missions, NetWorth } from "@/components/product/grow/GrowSections";
import { PageHeader } from "@/components/shared/ui/primitives";
import { StoryTitle } from "@/components/shared/surfaces/Surface";

export function GrowScreen() {
  const { state } = useFinance();
  const params = useSearchParams();
  const pathname = usePathname();
  const lesson = state.lessons.find((l) => l.id === params.get("aula") && l.available) ?? null;

  return (
    <>
      <PageHeader eyebrow="Longo prazo, sem pressa" title="Crescer" />
      <div className="flex flex-col gap-14">
        <NetWorth />
        <section aria-labelledby="timeline-title">
          <StoryTitle id="timeline-title" title="Sua história" kicker="Patrimônio mês a mês" />
          <FinancialTimelineSection />
        </section>
        <Investments />
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <Academy onOpen={(id) => replaceQuery(`${pathname}?aula=${id}`)} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Missions />
          </div>
        </div>
        <InsightsList />
      </div>
      <LessonSheet lesson={lesson} onClose={() => replaceQuery(pathname)} />
    </>
  );
}

