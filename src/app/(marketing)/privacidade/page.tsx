import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como o Lastro trata seus dados nesta versão.",
};

/**
 * Describes only how the product actually works today. To be replaced by the reviewed
 * legal text before launch.
 */
export default function PrivacidadePage() {
  return (
    <LegalPage title="Privacidade" updated="Versão preliminar — em revisão jurídica">
      <p>Este texto descreve, de forma simples, como o Lastro trata seus dados na versão atual. Ele será substituído pela política completa antes do lançamento.</p>
      <h2>Onde seus dados ficam</h2>
      <p>Nesta versão, sua conta e tudo o que você registra (movimentações, orçamentos, metas, reserva e foto de perfil) são salvos no armazenamento local do seu navegador, no seu aparelho.</p>
      <h2>Sua senha</h2>
      <p>A senha não é guardada em texto. Antes de ser salva, ela é transformada num código irreversível (hash com sal).</p>
      <h2>Conexões externas</h2>
      <p>O Lastro não se conecta à sua conta bancária. Você decide o que registrar.</p>
      <h2>Apagar seus dados</h2>
      <p>No seu perfil, a opção “Começar do zero” apaga as movimentações, metas e orçamentos da sua conta. Limpar os dados do site no navegador remove tudo.</p>
    </LegalPage>
  );
}
