import Link from "next/link";
import { AUTH_ROUTES, MARKETING_ROUTES } from "@/config/routes";
import { LastroMark } from "@/components/shared/brand/LastroMark";

const PRODUCT_LINKS = [
  { href: "/#produto", label: "Produto" },
  { href: "/#recursos", label: "Recursos" },
  { href: "/#planos", label: "Planos" },
  { href: AUTH_ROUTES.login, label: "Entrar" },
];
const LEGAL_LINKS = [
  { href: MARKETING_ROUTES.termos, label: "Termos" },
  { href: MARKETING_ROUTES.privacidade, label: "Privacidade" },
];

/** Minimal footer. Only real destinations — no placeholder social links. */
export function MarketingFooter() {
  return (
    <footer className="relative z-10 px-4 pt-10 pb-12 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-10 border-t border-ink-900/10 pt-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={MARKETING_ROUTES.home} className="flex items-center gap-2" aria-label="Lastro — página inicial">
            <LastroMark size={26} />
            <span className="font-display text-[20px] font-semibold tracking-[-0.03em] text-ink-900">lastro</span>
          </Link>
          <p className="mt-3 max-w-[30ch] text-[15px] text-ink-500">Sua vida financeira, finalmente visível.</p>
        </div>
        <nav aria-label="Rodapé" className="flex gap-14">
          <ul className="flex flex-col gap-2.5">
            {PRODUCT_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[15px] font-medium text-ink-700 hover:text-ink-900">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-2.5">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[15px] font-medium text-ink-700 hover:text-ink-900">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1160px] flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-ink-400">© {new Date().getFullYear()} Lastro</p>
        <p className="flex items-center gap-2.5 text-[12px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
          Produced by
          {/* The KLA SB artwork is white on transparent; used as a mask so it takes the footer's ink. */}
          <span
            role="img"
            aria-label="KLA SB"
            className="inline-block h-[18px] w-[73px] bg-ink-900"
            style={{ maskImage: "url(/brand/klaesb.png)", WebkitMaskImage: "url(/brand/klaesb.png)", maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }}
          />
        </p>
      </div>
    </footer>
  );
}
