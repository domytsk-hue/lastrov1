"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const UTM = ["source", "medium", "campaign", "term", "content"] as const;

function send(body: Record<string, unknown>) {
  // Fire-and-forget: tracking never delays or breaks a page.
  void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }).catch(() => {});
}

/**
 * First-party tracking: a page view per route change, and an affiliate landing when the URL
 * carries ?ref=CODE. After recording, `ref` is removed from the address bar so a refresh or a
 * shared URL doesn't count again. Renders nothing.
 */
export function Tracker() {
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) {
      const utm = Object.fromEntries(UTM.map((k) => [k, url.searchParams.get(`utm_${k}`)]).filter(([, v]) => v));
      send({ ref, path: url.pathname, referrer: document.referrer || null, utm });
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
    } else {
      send({ path: url.pathname });
    }
  }, [pathname]);

  return null;
}
