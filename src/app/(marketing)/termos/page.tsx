import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Termos de uso do Lastro.",
};

/** Placeholder until the reviewed terms are published. */
export default function TermosPage() {
  return (
    <LegalPage title="Termos de uso" updated="Versão preliminar — em revisão jurídica">
      <p>Os termos de uso completos do Lastro estão em elaboração e serão publicados aqui antes do lançamento.</p>
      <p>O Lastro é uma ferramenta de organização financeira pessoal. As informações exibidas são calculadas a partir do que você registra e não constituem recomendação de investimento.</p>
    </LegalPage>
  );
}
