import type { Metadata } from "next";
import { PatrimonioScreen } from "@/components/product/screens/GrowDetailScreens";

export const metadata: Metadata = { title: "Patrimônio" };

export default function Page() {
  return <PatrimonioScreen />;
}
