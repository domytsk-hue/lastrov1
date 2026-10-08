import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

const title = "Lastro — Sua vida financeira, finalmente visível";
const description =
  "O Lastro conecta gastos, orçamento, metas, reserva de emergência, investimentos e patrimônio em uma visão clara do seu dinheiro. Saiba quanto ainda pode gastar e veja seu patrimônio ganhar forma.";

const SHARE_IMAGE = { url: "/opengraph-image.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "Lastro — Sua vida financeira, finalmente visível. lastrofinance.com.br" };

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  // The share banner lives in src/app/opengraph-image.jpg; a page-level openGraph object
  // replaces the inherited one, so the image is named here too.
  openGraph: { type: "website", locale: "pt_BR", siteName: "Lastro", title, description, url: "/", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
};

export default function MarketingHome() {
  return <LandingPage />;
}
