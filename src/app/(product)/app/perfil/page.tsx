import type { Metadata } from "next";
import { ProfileScreen } from "@/components/product/screens/ProfileScreen";

export const metadata: Metadata = { title: "Perfil" };

export default function Page() {
  return <ProfileScreen />;
}
