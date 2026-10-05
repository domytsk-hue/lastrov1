# Lastro redesign: from dashboard to financial object

Reference: Nexora (visual philosophy only). Business logic in `src/lib` stays unchanged. This plan covers presentation, hierarchy and interaction.

## What makes the current Home look like a SaaS dashboard

| Current component | Why it reads as "dashboard" | New experience |
|---|---|---|
| `SideNavigation`: a 248px black sidebar with a "Registrar gasto" button and score card | Permanent admin chrome; eats horizontal space | **FloatingNav**. Desktop: a thin floating capsule at the top. The active item expands into a pill with its label, using a sliding `layoutId` indicator. Mobile: a native-style floating capsule with a separate green "+" orb. |
| `body` near-black `#050607` plus hairline borders on every card | Dark admin canvas, boxes inside boxes | Atmospheric ice-blue environment (`#D7EEFF`) with two slow radial lights. No hairline borders; depth comes from light and shadow. |
| `FinancialHero`: a blue rectangle, a 3-column KPI `dl` and a detached net-worth strip | KPI row; separate widgets | **BlueHero**: a single object. The balance uses rolling digits, a delta capsule sits under it, and circular actions (Gastar · Receber · Guardar · Investir) are set into the surface. A connected lower tray holds **FinancialFlow**: entrou → saiu → guardado, with money visibly moving along a track. |
| `QuickActions`: four separate square tiles | Toolbar of identical CTAs | Merged into the hero as embedded glass orbs. Only "Gastar" is green. |
| `LastroScoreCard`: radial tiles, a 6-bar pillar grid, "mais forte/próximo passo" boxes | Analytics widget with tiny metrics | **Orbit**: a circular surface with six variable-thickness segments. Labels run along the ring (`textPath`) and satellites sit outside it. The center counts from last week's score to today's (68 → 74). Tapping a segment expands it and changes the center, and an attached contextual card appears below. The pillar bars are removed. |
| `DailyPulse`: header, money, bar chart, a 3-column stats strip and a paragraph | Dense analytics card | **PulseCard**: one number, one human sentence and a tiny 7-point line. Tapping opens a sheet with the week, the budget state and the net-worth change. |
| `InsightCard` with prev/next arrows and 6 insights | Panel with pagination controls | **InsightStory**: editorial, large type, swipe (drag) between stories with dots. The first story can be a curiosity teaser ("Uma coisa mudou no seu padrão este mês.") that reveals itself on tap. |
| `BudgetSnapshot`: 3 category rows with bars and a legend line | Spreadsheet in a card | **Remaining-money surface**: "R$ 2.063 livres · ≈ R$ 76 por dia" on a curved progress arc, plus one line for whatever needs attention. Details live in Orçamentos. |
| `GoalsStrip`: identical rectangles | Generic progress cards | **GoalSurface**: collectible cards, each with its own colour and geometric mark, a large %, and a progress path with a moving knot. |
| `RecentTransactions`: a dark `card` list of 5 | Table rows | A dark navy **list surface** with a pill tab header (a "connected component"), 4 rows, each row expanding in place. |
| `NetWorthCard` (desktop only) | Chart widget | "Seu patrimônio ganhou força. +R$ 2.480 este mês" with a curve integrated into the surface. No axes. |
| `TransactionComposer` in a dark modal-style sheet | Conventional form | **BottomComposer**: an ice-blue floating sheet. The app underneath scales and blurs. The amount is huge, keys float in white, actions are navy, and the selected category chip morphs into place. On save the button compresses, the amount flies to the balance, the balance rolls, and the toast shows the consequence "≈ R$ 76 → R$ 72 por dia". |
| 12-column grid, `card` everywhere | Assembled, not composed | A vertical financial story: state → movement → progress → attention → goals. On desktop, a controlled asymmetric canvas with offsets and overlaps. |

## Surface archetypes (`src/components/shared/surfaces`)

1. **BlueHero**: the gradient object with inner highlight and cursor-following light.
2. **Capsule / DataCapsule**: pills for deltas, chips and tabs.
3. **OrganicCard**: a light frosted surface with asymmetric radii and an optional connected tab header (the concave notch, as in Nexora).
4. **Orbit / CircularSurface**: a ring-based data object (Lastro, investments, reserve layers).
5. **ExpandableSurface / Sheet**: in-place expansion and the light bottom sheet.

Plus a **NavySurface** for dark rhythm sections.

## Motion system (`src/design-system/motion.ts`)

- **Durations:** fast 140ms · normal 280ms · slow 520ms.
- **Springs:** soft (260/26) and snappy (400/32).
- **Page transitions:** `template.tsx` (opacity + 8px + 0.995 scale, 300ms).
- **Home entrance:** staggered at 80ms per step, under 700ms in total.
- **AnimatedMoney / AnimatedCounter / AnimatedPercentage:** rolling digits that animate only transform.
- **Magnetic buttons:** desktop with a fine pointer only, at most 3px.
- **Reduced motion:** everything renders statically.

## Order of work

1. Tokens, background, motion
2. Navigation
3. Home, Orbit, Pulse, Insight, Budget preview
4. Composer and money flow
5. Propagate to Movimentos, Planejar, Orçamentos, Metas, Reserva (protection layers), Crescer (investment orbit, net worth, timeline, Academy), Perfil, Entrar
