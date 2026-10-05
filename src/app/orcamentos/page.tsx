import type { Metadata } from "next";
import { BudgetsScreen } from "./BudgetsScreen";

export const metadata: Metadata = { title: "Orçamentos" };

export default function Page() {
  return <BudgetsScreen />;
}
