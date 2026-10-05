import type { MetadataRoute } from "next";

/** Install metadata: the icon people see when they add Lastro to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lastro",
    short_name: "Lastro",
    description: "Sua vida financeira, finalmente visível.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F2F2F4",
    theme_color: "#F2F2F4",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
