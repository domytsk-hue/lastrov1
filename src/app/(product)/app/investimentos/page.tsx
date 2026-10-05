import type { Metadata } from "next";
import { InvestimentosScreen } from "@/components/product/screens/GrowDetailScreens";

export const metadata: Metadata = { title: "Investimentos" };

export default function Page() {
  return <InvestimentosScreen />;
}
