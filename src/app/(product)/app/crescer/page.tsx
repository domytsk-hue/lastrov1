import type { Metadata } from "next";
import { Suspense } from "react";
import { GrowScreen } from "@/components/product/screens/GrowScreen";

export const metadata: Metadata = { title: "Crescer" };

export default function Page() {
  return (
    <Suspense>
      <GrowScreen />
    </Suspense>
  );
}
