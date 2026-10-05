import { ProductShell } from "@/components/product/shell/ProductShell";

/**
 * PRODUCT layout — the authenticated financial application.
 * Only routes under /app get the finance stores, product navigation and composer.
 */
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell>{children}</ProductShell>;
}
