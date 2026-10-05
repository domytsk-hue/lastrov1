import Link from "next/link";
import { AUTH_ROUTES } from "@/config/routes";

/**
 * Placeholder for the Lastro landing page (next step).
 * It exists so "/" resolves inside the marketing layout; replace its content, not its location.
 */
export default function MarketingHome() {
  return (
    <section className="mx-auto flex max-w-[1120px] flex-col items-start px-4 pt-16 pb-24 sm:px-6 lg:px-10 lg:pt-28">
      <h1 className="max-w-3xl font-display text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink-900 sm:text-[64px]">
        Sua vida financeira, visivelmente avançando.
      </h1>
      <p className="mt-5 max-w-xl text-[18px] text-ink-700">Em breve, a apresentação completa do Lastro.</p>
      <Link href={AUTH_ROUTES.cadastro} className="mt-8 inline-flex h-14 items-center rounded-full bg-midnight px-7 text-[16px] font-semibold text-white">
        Criar conta
      </Link>
    </section>
  );
}
