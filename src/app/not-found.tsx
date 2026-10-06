import type { Metadata } from "next";
import { NotFoundView } from "./not-found-view";

/**
 * Root 404 — rendered by Next for every unmatched URL (marketing, auth and /app/*),
 * with a real 404 status. Never indexed.
 */
export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
