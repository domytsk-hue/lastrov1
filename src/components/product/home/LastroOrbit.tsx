"use client";

import { useMemo } from "react";
import { lastroLevel, lastroScore, type PillarId } from "@/product/domain/finance";
import { addDays } from "@/lib/format";
import { pillarStory } from "@/product/domain/stories";
import { useFinance } from "@/product/store/finance-store";
import { LastroOrbitView, type LastroDimension } from "@/components/shared/data-viz/LastroOrbitView";

/** Segment colours: a family of blues, with mint for the foundation (reserve). */
const COLORS: Record<PillarId, [string, string]> = {
  reserva: ["#0FB98F", "#18E0AE"],
  orcamento: ["#173D91", "#3678F5"],
  investimentos: ["#2459D6", "#65B7F2"],
  metas: ["#3678F5", "#8CCBFF"],
  fluxo: ["#0B2560", "#2C63D8"],
  dividas: ["#4F6A8E", "#9DB4D3"],
};

const ORDER: PillarId[] = ["reserva", "fluxo", "orcamento", "metas", "investimentos", "dividas"];

/** LASTRO ORBIT (product) — computes the user's real foundation and renders the shared view. */
export function LastroOrbit() {
  const { state, today } = useFinance();
  const { score, pillars } = useMemo(() => lastroScore(state, today), [state, today]);
  const prev = useMemo(() => lastroScore(state, addDays(today, -7)).score, [state, today]);

  const dimensions: LastroDimension[] = useMemo(
    () =>
      ORDER.map((id) => {
        const p = pillars.find((x) => x.id === id)!;
        return { id, label: p.label, value: p.value, color: COLORS[id][0], colorTo: COLORS[id][1], story: pillarStory(state, today, id) };
      }),
    [pillars, state, today],
  );

  return <LastroOrbitView dimensions={dimensions} score={score} previousScore={prev} levelName={lastroLevel(score).name} />;
}
