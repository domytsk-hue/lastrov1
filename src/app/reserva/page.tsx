import type { Metadata } from "next";
import { ReserveScreen } from "./ReserveScreen";

export const metadata: Metadata = { title: "Reserva de emergência" };

export default function Page() {
  return <ReserveScreen />;
}
