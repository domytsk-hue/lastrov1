import type { Metadata } from "next";
import { canUsePaidProduct } from "@/server/access/viewer.ts";
import { LockedScreen } from "@/components/product/access/LockedScreen";
import { ReserveScreen } from "@/components/product/screens/ReserveScreen";

export const metadata: Metadata = { title: "Reserva de emergência" };

export default async function Page() {
  // Paid module: decided on the server, per request. Without access the screen (and its
  // financial components) is never rendered — the locked state is.
  if (!(await canUsePaidProduct())) return <LockedScreen />;
  return <ReserveScreen />;
}
