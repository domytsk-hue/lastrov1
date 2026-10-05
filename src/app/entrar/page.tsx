import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "./AuthScreen";

export const metadata: Metadata = { title: "Entrar" };

export default function Page() {
  return (
    <Suspense>
      <AuthScreen />
    </Suspense>
  );
}
