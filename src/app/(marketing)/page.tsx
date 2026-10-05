import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

const title = "Lastro — Sua vida financeira, finalmente visível";
const description =
  "O Lastro conecta gastos, orçamento, metas, reserva de emergência, investimentos e patrimônio em uma visão clara do seu dinheiro. Saiba quanto ainda pode gastar e veja seu patrimônio ganhar forma.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Lastro", title, description, url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

export default function MarketingHome() {
  return <LandingPage />;
}
