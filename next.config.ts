import type { NextConfig } from "next";

/**
 * URL map
 *   /                     → marketing (public)
 *   /login, /cadastro     → authentication (public)
 *   /app/*                → financial product (requires a session)
 *
 * The redirects below keep links from before the /app split working (query strings are kept,
 * e.g. /movimentacoes?aba=contas → /app/movimentos?aba=contas).
 */
const legacyProductRoutes: [string, string][] = [
  ["/home", "/app"],
  ["/movimentacoes", "/app/movimentos"],
  ["/planejamento", "/app/planejamento"],
  ["/orcamentos", "/app/orcamentos"],
  ["/metas", "/app/metas"],
  ["/reserva", "/app/reserva"],
  ["/crescer", "/app/crescer"],
  ["/perfil", "/app/perfil"],
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      ...legacyProductRoutes.map(([source, destination]) => ({ source, destination, permanent: true })),
      { source: "/entrar", has: [{ type: "query", key: "modo", value: "cadastro" }], destination: "/cadastro", permanent: true },
      { source: "/entrar", destination: "/login", permanent: true },
    ];
  },
};

export default nextConfig;
