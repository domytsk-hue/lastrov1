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
- These rules are enforced by `npm run check:boundaries` (`scripts/check-boundaries.mjs`).

## Providers per experience

| Experience | Providers |
|---|---|
| All (root) | `AuthProvider` (reads the local session) and `ToastProvider` |
| Marketing | none extra; no financial state is ever initialized |
| Auth | none extra; it redirects to `/app` when a session exists |
| Product | `FinanceProvider` (per user), `UIProvider` (composer, privacy, money flow) |

## Route protection

Sessions currently live on the device (`localStorage`), so `/app/*` is protected client-side by `ProductShell`: no session means it redirects to `/login`. When sessions move to an HTTP-only cookie, add `middleware.ts` matching `/app/:path*`. That is the only place that needs to change.

## Product demos on the marketing site

Signature visuals are presentational and data-driven, so the landing can show them with demo data, without importing the product:

```tsx
import { LastroOrbitView } from "@/components/shared/data-viz/LastroOrbitView";
<LastroOrbitView dimensions={demoDimensions} score={74} previousScore={68} levelName="Sólido" />
```

`NetWorthChart`, `Orbit`, `ProtectionLayers`, `CurvedGauge`, `ProgressPath`, `AnimatedMoney` and the surfaces work the same way. In the product, thin wrappers such as `components/product/home/LastroOrbit` compute real data and render the same views.

## Legacy URLs

`next.config.ts` permanently redirects the pre-`/app` URLs (`/home`, `/movimentacoes`, `/entrar`, …) and keeps their query strings.
