# Lastro architecture

One repository, one design system, two experiences: the **public marketing website** and the **financial product**. Authentication sits between them.

```
src/
├── app/                         ROUTES ONLY (Next.js App Router)
│   ├── layout.tsx               html, fonts, design-system CSS, RootProviders
│   ├── providers.tsx            light cross-cutting providers: session + toasts
│   ├── template.tsx             page transition (all experiences)
│   ├── globals.css              imports Tailwind + src/design-system
│   ├── (marketing)/             PUBLIC website            → "/"
│   │   ├── layout.tsx           MarketingNav + MarketingFooter, no product state
│   │   └── page.tsx             landing (placeholder until it is built)
│   ├── (auth)/                  PUBLIC authentication     → /login, /cadastro
│   │   ├── layout.tsx           AuthScreen (mounted once) + redirect if signed in
│   │   ├── login/page.tsx
│   │   └── cadastro/page.tsx
│   ├── (product)/checkout/      AUTHENTICATED plan checkout → /checkout
│   └── (product)/app/           AUTHENTICATED product     → /app/*
│       ├── layout.tsx           ProductShell: session gate, finance + UI stores, nav, composer
│       ├── page.tsx             Home
│       └── movimentos/ planejamento/ orcamentos/ metas/ reserva/
│           crescer/ investimentos/ patrimonio/ aulas/ perfil/
│
├── design-system/               ONE SOURCE OF TRUTH for the visual language
│   ├── tokens.css               colors, type, radii, breakpoints (Tailwind @theme)
│   ├── surfaces.css             hero / light / navy / glass surfaces, utilities
│   ├── base.css                 document defaults, environment, keyframes, reduced motion
│   ├── motion.ts                durations, easings, springs
│   └── colors.ts                CSS-variable references for TS consumers (no copies)
│
├── components/
│   ├── shared/                  Lastro design language — props in, pixels out
│   │   ├── brand/               LastroMark, LastroLoader
│   │   ├── surfaces/            FinancialSurface, TabbedSurface, Capsule, CurvedGauge, ProgressPath…
│   │   ├── data-viz/            Orbit, LastroOrbitView, NetWorthChart, ProtectionLayers
│   │   ├── motion/              AnimatedMoney, AnimatedCounter, AnimatedPercentage
│   │   └── ui/                  Button, Segmented, PageHeader, BottomSheet, Toast, Avatar, privacy…
│   ├── marketing/               MarketingNav, MarketingFooter (landing sections go here)
│   ├── auth/                    AuthScreen, AuthLayoutShell
│   └── product/                 everything that knows about the user's money
│       ├── shell/               ProductShell, floating navigation, FlowLayer
│       ├── screens/             one screen per route (HomeScreen, MovementsScreen…)
│       ├── home/ transactions/ budgets/ goals/ grow/
│       └── ui/                  CategoryIcon, FinanceChips (domain-aware chips/badges)
│
├── product/                     product logic (no React UI)
│   ├── domain/                  finance engine, calculator, NL parser, stories, missions, types (+ tests)
│   ├── data/                    categories, demo data generator
│   └── store/                   finance store, reducer, UI store
├── auth/                        rules (+ tests) and the session store / AuthService seam
├── config/routes.ts             the URL map — every path is written here, nowhere else
├── config/plans.ts              the plan catalog (ids, prices, benefits) — one source of truth
└── lib/                         base utilities: cn, format, geometry, image
```

## Dependency direction

```
marketing ─┐
           ├─▶ auth (session only) ─┐
product ───┘                        ├─▶ shared ─▶ design-system, lib
                                    │
   config/routes ◀── everyone ──────┘
```

- `shared` never imports `product`, `marketing` or `auth`. Shared components take plain data through props. "Hide values" reaches them through a tiny `PrivacyProvider` context: the product supplies it, and elsewhere it defaults to visible.
- `marketing` and `product` never import each other.
- `server` (`src/server/**`: database, accounts, Centralis, payments, tracking) is imported only by route handlers in `src/app/api/**`. No UI layer may import it, so secrets and database drivers can't reach a browser bundle; UI talks to it over `/api/*`.
- These rules are enforced by `npm run check:boundaries` (`scripts/check-boundaries.mjs`).

## Providers per experience

| Experience | Providers |
|---|---|
| All (root) | `AuthProvider` (server session, cached locally), `ToastProvider`, `Tracker` (page views, `?ref=` landings) |
| Marketing | none extra; no financial state is ever initialized |
| Auth | none extra; it redirects to `/app` when a session exists |
| Product | `FinanceProvider` (per user), `UIProvider` (composer, privacy, money flow) |

## Route protection

Accounts live on the server (Supabase Postgres) with an HTTP-only session cookie; the client keeps a cached copy of the session so the app opens instantly, and `/api/auth/session` corrects it when reachable. `/app/*` is protected client-side by `ProductShell` (no session → `/login`) because financial data still lives on the device and the demo account has no server session; every server endpoint authenticates the cookie itself. Device-only accounts from before migrate to the server at their next sign-in.

Plan access (paywall) is decided on the server: the `/app` layout computes it for the signed-in account and every paid page checks it again per request, rendering the locked state instead of the module when there is no access. `/checkout` sits between sign-up and the app. See [`payments.md`](payments.md).

The one exception to "UI never imports `server`": server route files of the product (`app/(product)/**`, no `"use client"`) may import `server/access/**` for that check. They render only on the server, and server modules import `server-only`, so a client file importing them fails the build.

## Product demos on the marketing site

Signature visuals are presentational and data-driven, so the landing can show them with demo data, without importing the product:

```tsx
import { LastroOrbitView } from "@/components/shared/data-viz/LastroOrbitView";
<LastroOrbitView dimensions={demoDimensions} score={74} previousScore={68} levelName="Sólido" />
```

`NetWorthChart`, `Orbit`, `ProtectionLayers`, `CurvedGauge`, `ProgressPath`, `AnimatedMoney` and the surfaces work the same way. In the product, thin wrappers such as `components/product/home/LastroOrbit` compute real data and render the same views.

## Legacy URLs

`next.config.ts` permanently redirects the pre-`/app` URLs (`/home`, `/movimentacoes`, `/entrar`, …) and keeps their query strings.
