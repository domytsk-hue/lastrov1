import type { Metadata } from "next";
import { Suspense } from "react";
import { MovementsScreen } from "./MovementsScreen";

export const metadata: Metadata = { title: "Movimentações" };

export default function Page() {
  return (
    <Suspense>
      <MovementsScreen />
    </Suspense>
  );
}
