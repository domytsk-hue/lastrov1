import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";

/**
 * MARKETING layout — the public website.
 * No finance stores, no product navigation, no composer: just nav, page, footer.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-site flex min-h-dvh flex-col">
      <a href="#conteudo" className="sr-only z-[90] rounded-xl bg-midnight px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Pular para o conteúdo
      </a>
      <MarketingNav />
      <main id="conteudo" className="relative z-10 flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
