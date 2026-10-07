import { viewerAccess } from "@/server/access/viewer.ts";
import { ProductShell } from "@/components/product/shell/ProductShell";

/**
 * PRODUCT layout — the authenticated financial application.
 * Only routes under /app get the finance stores, product navigation and composer.
 * The plan access is computed here, on the server, for the signed-in account; each paid
 * page checks it again on its own request.
 */
export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const viewer = await viewerAccess();
  return <ProductShell access={viewer?.access ?? null}>{children}</ProductShell>;
}
