# Lastro

Lastro is a personal finance app for Brazil. It is built around progress rather than around transactions: every movement you record shows you what changed.

This repository holds **Phase 1**: the design system, the app shell, and a working prototype of Home, Movimentações, Orçamentos, Metas and Reserva. It also includes first versions of Planejar, Crescer (net worth, timeline, investments, Academy, missions) and Perfil. All of it runs on realistic demo data for "Lucas".

```bash
npm install
npm run dev        # http://localhost:3000 → /home
npm test           # finance engine, calculator and natural-language parser
npm run typecheck
```

## Signature elements

| | |
|---|---|
| **Seu Lastro** | A radial "strata" object: 6 pillars (Reserva, Orçamento, Investimentos, Metas, Fluxo, Dívidas) × 7 layers. Layers gained in the last 7 days glow. Tap a sector for detail and the next step. The brand mark is the same ring in simplified form: its bottom segment is the heaviest, like a foundation. |
| **Pulso** | A daily snapshot: variable spending today against your average for that weekday, a 7-day chart, the budget state, goals and net-worth change, plus one insight. |
| **Linha do tempo** | Net worth by month, with milestones as stations along the way (first R$ 10k invested, reserve months, all-time high…). |

## Architecture

```
src/
  lib/            pure, framework-free business logic (unit tested with node:test)
    types.ts        domain models (User, Account, Transaction, Budget, Goal, …)
    finance.ts      balances, budgets, projections, reserve, goals, Lastro score, pulse, insights
    calculator.ts   safe expression parser: 125 + 32,50 + 18 · 200 - 10% · 200 / 4 → parcelas
    quick-entry.ts  "gastei 89 no mercado", "120 gasolina ontem", "coloca 300 na reserva"
    feedback.ts     the one-line consequence shown after every movement
    missions.ts     weekly missions derived from real behaviour
  data/           categories + deterministic demo generator (relative to today)
  store/          reducer (pure) + React context with localStorage persistence
  components/     ui primitives · shell · home · transactions · budgets · goals · reserve · charts · grow
  app/            Next.js routes; each page is a thin wrapper over a *Screen client component
```

- **One source of truth.** Account balances, goal progress and the reserve are all derived from the transaction list, so recording R$ 45 in Alimentação updates the available balance, the month summary, the budget, Pulso, the projection, insights and the Lastro score at the same moment.
- **Everything is "as of" a date**, so the app can compare with the same day last month, or with your score a week ago.
- `dispatch` returns the next state synchronously. That lets the composer show the real consequence ("Alimentação: R$ 904 disponíveis · R$ 33/dia") the instant you save.
- The natural-language parser returns a `ParsedEntry`, which an AI model could later fill instead without touching the UI.

## Design tokens

These are defined in `src/app/globals.css` (Tailwind v4 `@theme`):

- **Base colours:** ink `#050607`, surfaces `#0B0D10` / `#11151A`, graphite, muted, soft, off-white.
- **Accent colours,** each with a light companion: green `#00D99B` (progress), purple `#6637F5` (intelligence), coral `#FF455D` (alerts, used sparingly), blue `#2563F5` (investments), yellow `#FFC234` (achievements).
- **Fonts:** Telegraf for display and SF Pro Text for the UI, used when they are installed on the device. Otherwise Manrope and Inter, loaded through `next/font`, take their place.
- **Radii and motion:** cards 24–28px, controls 14–16px, pills 999px. Motion uses 200–400ms with a `cubic-bezier(.22,1,.36,1)` ease, and respects `prefers-reduced-motion`.

## Accessibility

- Budget states always show an icon and a label, never colour alone.
- Focus is visible everywhere, and bottom sheets trap focus and close on Escape.
- On desktop, `N` opens the composer.
- A privacy mode hides all values.

## Not yet built (next phases)

- Onboarding flow
- Real auth and sync (data currently lives in `localStorage`)
- Bank connections
- AI-backed entry
- Remaining Academy lessons
- Automatic generation of recurring transactions
