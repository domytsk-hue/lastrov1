import type { Metadata } from "next";
import { canUsePaidProduct } from "@/server/access/viewer.ts";
import { LockedScreen } from "@/components/product/access/LockedScreen";
import { BudgetsScreen } from "@/components/product/screens/BudgetsScreen";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function Page() {
  // Paid module: decided on the server, per request. Without access the screen (and its
  // financial components) is never rendered — the locked state is.
  if (!(await canUsePaidProduct())) return <LockedScreen />;
  return <BudgetsScreen />;
}
