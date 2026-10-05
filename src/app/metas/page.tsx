import type { Metadata } from "next";
import { GoalsScreen } from "./GoalsScreen";

export const metadata: Metadata = { title: "Metas" };

export default function Page() {
  return <GoalsScreen />;
}
