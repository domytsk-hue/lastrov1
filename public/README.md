# Public assets

Static files served as-is from `/`. Organize by layer, and never duplicate a file across folders:

| Folder | What goes here | Served at |
|---|---|---|
| `brand/` | Logo exports, social/OG images, app-store artwork | `/brand/...` |
| `marketing/` | Landing-page imagery, illustrations, videos | `/marketing/...` |
| `product/` | Images used only inside the app (`/app`) | `/product/...` |
| `shared/` | Assets used by both marketing and product | `/shared/...` |

The favicon/app icon is **not** here: it lives at `src/app/icon.svg`, following the Next.js file convention, so it is generated for every route. The Lastro mark itself is code (`src/components/shared/brand/LastroMark.tsx`), so it scales and animates. Export a static SVG to `brand/` only when an external consumer needs a file.
