/** Simple document layout for legal pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-[720px] px-4 pt-36 pb-24 sm:px-6">
      <p className="eyebrow text-electric">Lastro</p>
      <h1 className="mt-3 font-display text-[clamp(36px,5vw,52px)] leading-[1.05] font-semibold tracking-[-0.035em] text-ink-900">{title}</h1>
      <p className="mt-3 text-[14px] text-ink-500">{updated}</p>
      <div className="mt-10 flex flex-col gap-6 text-[17px] leading-relaxed text-ink-700 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:text-ink-900">{children}</div>
    </article>
  );
}
