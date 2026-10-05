import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

// Telegraf (display) and SF Pro Text (UI) are used when installed on the device.
// Manrope and Inter are metric-friendly fallbacks loaded from Google Fonts.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", weight: ["500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Lastro", template: "%s · Lastro" },
  description: "Lastro torna seu progresso financeiro visível, compreensível e satisfatório.",
  applicationName: "Lastro",
  appleWebApp: { capable: true, title: "Lastro", statusBarStyle: "black-translucent" },
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
