import type { Metadata } from "next";
import { Suspense } from "react";
import { MovementsScreen } from "@/components/product/screens/MovementsScreen";

export const metadata: Metadata = { title: "Movimentações" };

export default function Page() {
  return (
    <Suspense>
      <MovementsScreen />
    </Suspense>
  );
}
