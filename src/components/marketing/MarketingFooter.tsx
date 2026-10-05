import { LastroMark } from "@/components/shared/brand/LastroMark";

/** Public site footer. Legal pages (termos, privacidade) will be linked here. */
export function MarketingFooter() {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-[1120px] items-center justify-between px-4 py-10 text-[14px] text-ink-500 sm:px-6 lg:px-10">
      <span className="flex items-center gap-2">
        <LastroMark size={20} />© {new Date().getFullYear()} Lastro
      </span>
    </footer>
  );
}
