import type { Metadata } from "next";
import { ReserveScreen } from "@/components/product/screens/ReserveScreen";

export const metadata: Metadata = { title: "Reserva de emergência" };

export default function Page() {
  return <ReserveScreen />;
}
