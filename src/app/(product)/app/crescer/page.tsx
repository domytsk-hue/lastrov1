import type { Metadata } from "next";
import { canUsePaidProduct } from "@/server/access/viewer.ts";
import { LockedScreen } from "@/components/product/access/LockedScreen";
import { Suspense } from "react";
import { GrowScreen } from "@/components/product/screens/GrowScreen";

export const metadata: Metadata = { title: "Crescer" };

export default async function Page() {
  // Paid module: decided on the server, per request. Without access the screen (and its
  // financial components) is never rendered — the locked state is.
  if (!(await canUsePaidProduct())) return <LockedScreen />;
  return (
    <Suspense>
      <GrowScreen />
    </Suspense>
  );
}
