import type { Metadata } from "next";
import { canUsePaidProduct } from "@/server/access/viewer.ts";
import { LockedScreen } from "@/components/product/access/LockedScreen";
import { Suspense } from "react";
import { MovementsScreen } from "@/components/product/screens/MovementsScreen";

export const metadata: Metadata = { title: "Movimentações" };

export default async function Page() {
  // Paid module: decided on the server, per request. Without access the screen (and its
  // financial components) is never rendered — the locked state is.
  if (!(await canUsePaidProduct())) return <LockedScreen />;
  return (
    <Suspense>
      <MovementsScreen />
    </Suspense>
  );
}
