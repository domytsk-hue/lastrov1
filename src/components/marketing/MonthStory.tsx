"use client";

import { Check } from "lucide-react";
import { DEMO } from "./demo-data";
import { Rise, Section, SectionHeading, WhenSeen } from "./motion";
import { BalanceSurface } from "./ui";

const WITHOUT = ["Sem planilhas.", "Sem contas de cabeça.", "Sem procurar informação em cinco lugares."];

/** The month, understood in seconds: the app's Home hero with the numbers arriving. */
export function MonthStory() {
  return (
    <Section id="produto" labelledBy="month-title">
      <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <SectionHeading id="month-title" kicker="Seu mês" title="Entenda seu mês em segundos." lead="Quanto entrou, quanto saiu, quanto ficou guardado — e quanto você ainda tem." />
          <ul className="mt-10 flex flex-col gap-3">
            {WITHOUT.map((line, i) => (
              <Rise key={line} as="div" delay={0.15 + i * 0.12} className="flex items-start gap-3 text-[18px] leading-8 font-medium text-ink-900">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint/20 text-mint-ink">
                  <Check className="size-4" strokeWidth={3} />
                </span>
                {line}
              </Rise>
            ))}
          </ul>
        </div>
        <WhenSeen className="lg:col-span-7" minHeight={420}>
          <BalanceSurface available={DEMO.available} income={DEMO.income} spent={DEMO.spent} saved={DEMO.saved} pace={DEMO.paceVsLastMonth} />
        </WhenSeen>
      </div>
    </Section>
  );
}
