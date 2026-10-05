/**
 * The URL map of Lastro — the one place paths are written down.
 * Every layer (marketing, auth, product) imports from here; nothing hard-codes a path.
 */

/** Public marketing site. */
export const MARKETING_ROUTES = {
  home: "/",
} as const;

/** Public authentication. */
export const AUTH_ROUTES = {
  login: "/login",
  cadastro: "/cadastro",
} as const;

/** The authenticated financial product lives under /app. */
export const PRODUCT_BASE = "/app";

export const ROUTES = {
  home: "/app",
  movimentos: "/app/movimentos",
  planejamento: "/app/planejamento",
  orcamentos: "/app/orcamentos",
  metas: "/app/metas",
  reserva: "/app/reserva",
  crescer: "/app/crescer",
  investimentos: "/app/investimentos",
  patrimonio: "/app/patrimonio",
  aulas: "/app/aulas",
  perfil: "/app/perfil",
} as const;

export const isProductPath = (path: string) => path === PRODUCT_BASE || path.startsWith(`${PRODUCT_BASE}/`);
