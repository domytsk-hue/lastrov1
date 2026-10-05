# Lastro

Lastro is a personal finance app for Brazil. It is built around progress rather than around transactions: every movement you record shows you what changed.

This repository holds **Phase 1**: the design system, the app shell, and a working prototype of Home, Movimentações, Orçamentos, Metas and Reserva. It also includes first versions of Planejar, Crescer (net worth, timeline, investments, Academy, missions) and Perfil. All of it runs on realistic demo data for "Lucas".

```bash
npm install
npm run dev        # http://localhost:3000  (/ site · /app product)
npm test           # finance engine, calculator, NL parser, auth rules
npm run check:boundaries   # layer import rules
npm run typecheck
```

## Contas (login e cadastro)

`/login` and `/cadastro` are one screen with two tabs: **Entrar** and **Criar conta**.

- **Sign-up** asks for name, email or phone, and a password.
- **Contact field:** one field takes either an email or a Brazilian phone. A phone is masked as you type, `(11) 98765-4321`, and stored as `+5511987654321`. That means `11987654321`, `+55 11 98765-4321` and `(11) 98765-4321` all reach the same account.
- **Password:** at least 8 characters, with one letter and one number. A checklist updates live as you type.
- **Error messages:** a failed login says the same thing whether the contact or the password was wrong. Duplicate accounts are refused.
- **Demo mode:** "Explorar com dados de demonstração" opens Lucas' demo account.
- **Access:** without a session, `/app/*` redirects to `/login`. With one, `/login` and `/cadastro` send you to `/app`. The marketing site (`/`) is always public. Perfil has *Sair*.
- **Separate data:** each account keeps its own financial data, and a new account starts empty, with guiding empty states.

**Important — no server yet.** Accounts are stored in the browser (`localStorage`).

- **Passwords:** hashed with PBKDF2-SHA256 (210k iterations, random salt per user).
- **What this means:** it's good for a prototype, but it is not server security. Anyone with access to the device can see the data.
- **Moving to a real backend:** `src/auth/auth-store.tsx` exposes an `AuthService` interface (`signUp`, `signIn`, `enterDemo`). A real backend only needs to implement it. The validation rules in `src/auth/rules.ts` are pure and can be reused on the server.

## Signature elements

| | |
|---|---|
| **Seu Lastro** | A radial "strata" object: 6 pillars (Reserva, Orçamento, Investimentos, Metas, Fluxo, Dívidas) × 7 layers. Layers gained in the last 7 days glow. Tap a sector for detail and the next step. The brand mark is the same ring in simplified form: its bottom segment is the heaviest, like a foundation. |
| **Pulso** | A daily snapshot: variable spending today against your average for that weekday, a 7-day chart, the budget state, goals and net-worth change, plus one insight. |
| **Linha do tempo** | Net worth by month, with milestones as stations along the way (first R$ 10k invested, reserve months, all-time high…). |

## Architecture

Lastro has three layers in one repo: **marketing** (`/`), **product** (`/app/*`) and the **shared** design system. Authentication (`/login`, `/cadastro`) sits between them. See **[docs/architecture.md](docs/architecture.md)** for the full map, the dependency rules and the provider strategy.

```
src/app/(marketing)  src/app/(auth)  src/app/(product)/app     ← routes only
src/design-system                                                ← tokens, surfaces, motion (one source of truth)
src/components/{shared,marketing,auth,product}                   ← UI by layer
src/product/{domain,data,store}   src/auth   src/config/routes.ts   src/lib
```

- **One source of truth.** Account balances, goal progress and the reserve all come from the transaction list. Recording R$ 45 in Alimentação updates the balance, budget, Pulso, projection, insights and the Lastro score at once.
- **Everything is "as of" a date,** so the app can compare with the same day last month, or with your score a week ago.
- `npm run check:boundaries` fails the build if a layer imports one it shouldn't, for example shared → product or marketing → product.

## Design language

Lastro is designed as a personal financial *object*, not a dashboard. See [`docs/redesign-plan.md`](docs/redesign-plan.md) for the component-by-component mapping.

- **Environment:** an ice-blue background (`#D7EEFF`) lit by two soft lights that drift slowly. Depth comes from layered surfaces, light from the top-left, and shadow, never from borders.
- **Surfaces** (`src/components/shared/surfaces`, `src/components/shared/data-viz`):
  - **BlueHero:** the blue gradient object at the top of Home.
  - **Organic light card:** asymmetric radii.
  - **Navy surface:** a dark section that gives the page rhythm.
  - **TabbedSurface:** a pill tab joined to its body by a concave notch.
  - **Capsules:** small pill elements on any surface.
  - **Orbit:** a ring of variable-thickness segments with labels that run along it.
  - **CurvedGauge, ProgressPath and ProtectionLayers:** custom progress shapes.
- **Numbers:** `AnimatedMoney`, `AnimatedCounter` and `AnimatedPercentage` roll each digit independently and animate only transform.
- **Motion:** tokens live in `src/design-system/motion.ts` (fast 140ms · normal 280ms · slow 520ms; springs soft 260/26 and snappy 400/32).
  - Page transitions use `app/template.tsx`.
  - Home enters in 80ms steps.
  - After a save, the amount flies from the composer to the balance through `FlowLayer`, and the balance digits then roll.
  - Everything respects `prefers-reduced-motion`.
- **Navigation:** a floating capsule at the top on desktop and at the bottom on mobile. The active item expands into a pill with its label, and the pill slides between items. On mobile, a separate mint orb holds the main action.
- **Colours:** ice `#CDE9FF`, sky `#8CCBFF`, soft `#65B7F2`, electric `#3678F5`, deep `#173D91`, midnight `#071A3B`, navy `#061126`, snow `#F6FBFF`, ink `#081525`, and mint `#18E0AE`, used sparingly.
- **Fonts:** Telegraf for display and SF Pro Text for the UI, when they are installed. Otherwise Manrope and Inter.

## Accessibility

- Budget states always show an icon and a label, never colour alone.
- Every swipe action (edit, duplicate, delete) is also available when you expand the row. The orbit segments are keyboard-focusable buttons.
- Focus is visible everywhere, and bottom sheets trap focus and close on Escape.
- On desktop, `N` opens the composer.
- A privacy mode hides all values.

## Not yet built (next phases)

- Onboarding flow
- Server-side auth and sync (accounts and data currently live in `localStorage`)
- Password recovery and email/SMS verification
- Bank connections
- AI-backed entry
- Remaining Academy lessons
- Automatic generation of recurring transactions
