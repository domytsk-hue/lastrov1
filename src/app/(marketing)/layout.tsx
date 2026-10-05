import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";

/**
 * MARKETING layout — the public website.
 * No finance stores, no product navigation, no composer: just nav, page, footer.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingNav />
      <main id="conteudo" className="relative z-10 flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
