import type { Metadata } from "next";
import { Suspense } from "react";
import { AulasScreen } from "@/components/product/screens/GrowDetailScreens";

export const metadata: Metadata = { title: "Aulas" };

export default function Page() {
  return (
    <Suspense>
      <AulasScreen />
    </Suspense>
  );
}
