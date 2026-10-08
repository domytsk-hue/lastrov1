import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { RootProviders } from "./providers";
import "./globals.css";

// Telegraf (display) and SF Pro Text (UI) are used when installed on the device.
// Manrope and Inter are metric-friendly fallbacks loaded from Google Fonts.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", weight: ["500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  // Absolute base for Open Graph URLs. Set NEXT_PUBLIC_SITE_URL in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Lastro", template: "%s · Lastro" },
  description: "Lastro torna seu progresso financeiro visível, compreensível e satisfatório.",
  applicationName: "Lastro",
  appleWebApp: { capable: true, title: "Lastro", statusBarStyle: "black-translucent" },
  // Link previews (WhatsApp, Instagram, X, LinkedIn…) on every page. The banner itself is
  // src/app/opengraph-image.jpg / twitter-image.jpg (1200×630), picked up by Next.js.
  openGraph: { type: "website", locale: "pt_BR", siteName: "Lastro", title: "Lastro — Sua vida financeira, finalmente visível", url: "/" },
  twitter: { card: "summary_large_image", title: "Lastro — Sua vida financeira, finalmente visível" },
};

export const viewport: Viewport = {
  themeColor: "#050607",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${inter.variable}`}>
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
