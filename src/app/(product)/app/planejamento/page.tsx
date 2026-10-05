import type { Metadata } from "next";
import { PlanningScreen } from "@/components/product/screens/PlanningScreen";

export const metadata: Metadata = { title: "Planejar" };

export default function Page() {
  return <PlanningScreen />;
}
