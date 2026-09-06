# DealFlow360 — Handoff

Written for the next coding agent picking this repository up. It records what is
true in the working tree today, not what is planned. Where something is missing
or deliberately not built it says so plainly.

**Read these three files before writing any code. They are not optional.**

| File | What it is |
|---|---|
| `CLAUDE.md` | The rules. Conventions, architectural constraints, build order, and an explicit "things not to do" list. It overrides your defaults. |
| `specs.md` | The product. Business rules, the worked discount example (§3), the data model, the 18 screens (§6), and the 8-step acceptance flow (§7). |
| `DESIGN.md` | The visual system. Palette, type scale, spacing tokens, component behaviour. |

---

## 1. What this is

A B2B Sales Operations platform built for the Odoo hackathon, covering
quotation → multi-tier discount approval → multi-warehouse fulfillment → hybrid
one-time + subscription billing → customer-facing portal negotiation → deal
health monitoring.

The judged differentiator is **business logic correctness**, not UI polish.
Discount governance, warehouse splitting and billing proration are implemented
in real application logic. Nothing is hardcoded or stubbed to make a demo pass —
keep it that way.

### Stack (fixed — do not substitute)

Verified against the manifests in the tree today:

| Layer | Choice | Version in `package.json` |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | React 18, Vite 6, Tailwind 3, react-router-dom 6 |
| Backend | Node + Express + TypeScript, REST | Express 4.21, zod 3.24 |
| Database | PostgreSQL + Prisma ORM | Prisma 6.3, Postgres 16 (Docker) |
| Reporting export | pdfkit 0.16, xlsx 0.18 | backend dependencies |
| Monorepo | npm workspaces | `shared`, `backend`, `frontend` |
| Tests | Vitest | 3.x, backend only |
| Browser verification | Playwright | 1.63, root devDependency |

**The app is REST-only.** There is no socket layer and no socket dependency:
`socket.io` / `socket.io-client` were removed from the manifests, and the four
socket scaffolds (`backend/src/sockets/*`, `frontend/src/lib/socket-client.ts`,
`shared/types/socket-events.ts`) were deleted. See §4.

---

## 2. Repository structure

```
dealflow360/
├── shared/          # @dealflow360/shared — types shared by FE and BE
│   ├── index.ts     # barrel: 17 type modules
│   ├── types/
│   └── dist/        # CommonJS build — MUST be rebuilt after a type edit
├── backend/
│   ├── prisma/      # schema.prisma, one migration, seed.ts
│   ├── src/
│   │   ├── app.ts, server.ts
│   │   ├── config/env.ts        # the only place process.env is read
│   │   ├── lib/                 # errors, prisma-client, async-handler
│   │   ├── middleware/          # auth, portal-auth, rbac, validate, error-handler
│   │   ├── modules/             # 21 modules
│   │   └── shared/audit/        # audit.service.ts
│   └── tests/       # fulfillment-split, subscription-proration, negotiation
├── frontend/
│   └── src/
│       ├── components/layout/   # InternalLayout, InternalNav, NotificationBell,
│       │                        # PortalLayout, PortalNav
│       ├── components/ui/       # the design-system kit (Card, Table, Badge, …)
│       ├── context/             # AuthContext, PortalAuthContext
│       ├── features/<domain>/   # api + hooks per domain (17 domains)
│       ├── lib/                 # api-client, format
│       ├── pages/internal/…     # list + detail pairs
│       ├── pages/portal/…       # the customer surface
│       └── routes/              # access.ts, guards.tsx, portal-routes.tsx
└── docs/            # this file (architecture diagram + next-steps still to write)
```

There is no `frontend/src/components/shared/` directory — those seven files were
empty stubs and were deleted. The kit lives in `components/ui/`.

### Backend module shape

Each module under `backend/src/modules/<name>/` is:

```
<name>.controller.ts   # HTTP only: read parsed request, call service, respond
<name>.service.ts      # business logic + Prisma
<name>.routes.ts       # routes, guards applied here
<name>.schemas.ts      # zod schemas for params / query / body
```

Guards are **path-scoped** — `routes.use('/alerts', auth, seesTheBoard)` — never
a bare `router.use(auth)`, which would leak onto every other module's routes
mounted after it.

### Frontend shape

Every internal module is a **list + detail pair**; a row click opens the detail.
Domain API calls and hooks live in `frontend/src/features/<domain>/`. Screens
never call `fetch` directly and never hold business logic.

### The three pure engines — do not put I/O in these

CLAUDE.md rule 1. Plain objects in, plain objects out. No Prisma, no Express, no
`Date.now()`.

| File | What it decides |
|---|---|
| `backend/src/modules/discount-engine/discount-engine.service.ts` | Per-line overage, the blended risk score (0.6 × worst single + 0.4 × total), the risk level, and the required approval chain |
| `backend/src/modules/fulfillment/split-allocator.ts` | Which warehouses fill a line, in what quantities, and what backorders |
| `backend/src/modules/subscriptions/proration.ts` | Mid-cycle proration on a plan change |

Callers resolve the inputs and pass them in — the engines look nothing up. When
you need what an engine knows, **call it**; never re-implement its arithmetic.
`discount-tiers.service.ts` is the worked example: it discovers the live risk
bands by running `computeDiscountRisk` with probe inputs rather than copying its
constants.

---

## 3. What is built — module checklist

Status is judged from the code, not intent.

| Module | Backend | Frontend | specs §6 screens |
|---|---|---|---|
| Auth (internal) | `POST /auth/login`, `GET /auth/me`, JWT | `Login.tsx` | 1 (internal half) |
| RBAC / staff users | `/users` CRUD, `/roles` — ADMIN only | list, detail, create | — |
| Sales dashboard | reads existing endpoints | `pages/internal/Dashboard.tsx` | 2 |
| Quotations | list, detail, create, line add/edit/delete, submit, confirm | list grouped by stage, detail with live `OVER (+Npt)` badges | 3, 4 |
| Recommendations / upsell | `GET /quotations/:id/recommendations`, accepted line carries `sourceRecommendationId` | `components/UpsellPanel.tsx` on the quotation detail | part of 4 |
| Approvals | list, detail, approve / return / reject | per-line "why flagged" breakdown from `risk_score_factor`, step timeline, audit trail | 5, 6 |
| Audit trail | `GET /quotations/:id/audit` | `approvals/components/AuditTrail.tsx` | part of 6 |
| Fulfillment | split suggestion, accept, manual override, ship, backorder consolidation | list + detail | 7, 8 |
| Warehouses / inventory | warehouse CRUD, stock receipts, corrections, reserved floor enforced | list, detail, stock modals, backorder consolidation | supports 7, 8 |
| Subscriptions | list, detail, change, cancel, generate-invoice; `GET /subscription-plans` | list + detail | 9, 10 |
| Billing / invoices | list, detail, `POST /invoices/:id/pay`, `/orders/:id/billing` | list, detail with progress timeline, record payment | 12, 13 |
| Customer portal | `/portal/quotations`, detail, negotiate, confirm; separate `portal-auth` | Overview, My Quotations, Negotiation, Messages, Profile | 11 |
| Negotiation (internal side) | `GET /quotations/:id/negotiations`, `POST /negotiation-requests/:id/respond` | `quotations/components/NegotiationPanel.tsx` | part of 4 and 11 |
| Products / catalogue | CRUD, variants, categories, price-list reads | catalogue, detail, create | 16, 17 |
| Customers | CRUD + contacts | book, detail, create | — |
| Deal health | 3 detectors, idempotent `POST /alerts/scan`, acknowledge, escalate | alert board with type filter | 14 |
| Reporting | `/reports/summary`, `/quotations`, `/discounts`, `/owners`, `/export?format=pdf\|xlsx` | filters, metric cards, discount analysis, breakdown, export | 15 |
| Discount tier config | `GET /discount-rules`, `PATCH /discount-rules/:id` — ADMIN | `products/DiscountTiersConfig.tsx` | 18 — **phase 1** |
| Notification bell | none — composes `/approvals`, `/alerts`, `/quotations?status=` | `layout/NotificationBell.tsx` in the sticky header | — |

**All 18 specs §6 screens have a working surface.** Screen 18 is phase 1: tier,
category and global ceilings are editable; the approval-chain bands are shown
read-only because they are engine constants, not rows (see §4).

Two backend modules are still `export {};` — `portal-messages` and
`portal-profile`. They are **not mounted**, and the features they name are built
elsewhere and work:

- portal Messages reads the negotiation history off the quotations the customer
  can already open — there is deliberately no separate messages endpoint
- portal Profile reads `GET /portal/auth/me` and is read-only by design

Do not "fill in" those two without checking whether you would be building a
second copy of something that already works.

### specs §7 acceptance flow — 8 steps

| # | Step | Status |
|---|---|---|
| 1 | Log in, set up a discount tier / warehouse / subscription plan | **Passes**, with one honest limit. Login, warehouse CRUD and creating a recurring product all work in the UI, and screen 18 edits tier / category / global ceilings. Creating a brand-new `customer_tier` or `subscription_plan` **row** has no UI — only editing the seeded ones. |
| 2 | Create a quotation with a discount higher than allowed | **Passes.** |
| 3 | Confirm the quote automatically requests manager approval | **Passes.** Submit runs the engine and raises the chain; the rep never asks. |
| 4 | Accept an upsell suggestion, total and margin update immediately | **Passes.** `UpsellPanel` adds the line and the server recomputes and returns new totals, margin, ceiling and overage in the same response. |
| 5 | Approve, then confirm stock splits across warehouses | **Passes.** |
| 6 | One-time + recurring on one order billed separately | **Passes.** |
| 7 | Portal counter-discount re-enters approval automatically | **Passes**, both directions: the customer's portal confirm, and staff accepting the counter from the quotation (`NegotiationPanel`). Covered by `tests/negotiation.test.ts`. |
| 8 | Confirm order, record payment, invoice status updates | **Passes.** |

The whole chain has been run end to end on a fresh seed with Playwright against
the live stack.

---

## 4. Known gaps, and what was deliberately not built

Nothing here is an accident — each line says whether it is unfinished work or a
decision.

1. **Approval-chain configuration (screen 18, phase 2) — deliberately not
   built.** Ceilings are rows and are now editable. The bands that turn a
   blended score into a chain are **constants inside the pure engine**
   (`resolveApprovalChain`, and the high-risk threshold of `5.00`), not rows.
   Making them configurable means changing what `computeDiscountRisk` takes as
   input, which is an engine-logic change — CLAUDE.md says to ask first, and the
   answer so far has been "phase 2, later". The screen shows the live bands
   read-only, measured by running the engine, so it can never drift from what
   actually routes a quotation.

2. **Dead tables kept in the schema, not dropped.** These models exist and are
   read by nothing. Dropping them is a migration, and a migration is a decision
   nobody has asked for — so they stay, documented rather than quietly removed:

   | Model | State |
   |---|---|
   | `ApprovalChainRule` | Seeded with 3 rows, read by no code. Its seeded bands (1.00–15.00 / 15.01+) also **disagree** with the engine's live threshold of 5.00 — do not trust them. |
   | `PortalRole` | Seeded with one row and assigned to every contact, but no code reads a permission off it. Portal access is decided by `portal-auth` alone. |
   | `RolePermission` | Never created — the seed only wipes it. Internal authorisation is `requireRole(...)` against role codes. |
   | `ReportView` | Never touched anywhere. |
   | `ErpIntegration` | Never touched. The `integrations` module stub that named it was deleted. |
   | `PaymentGatewayTransaction` | Never touched. Payments are recorded directly on `payment`. |

3. **`PriceList` / `PriceListItem` — read-only, and empty.** The product detail
   reads price-list entries and the delete guard counts them, but there is no
   CRUD and **the seed creates none**, so the section is always empty in a fresh
   database. specs screen 17 asks for tier/currency price lists.

4. **Sockets — removed, on purpose.** CLAUDE.md rule 6 describes an optional
   socket layer over REST. It was never implemented, so the empty scaffolds and
   both dependencies were deleted rather than left looking like a feature.
   Screen 4's "checked live as it is typed" is satisfied by a REST round-trip
   per line edit — the server recomputes and returns the new ceiling and
   overage. If you add sockets, they layer **on top of** REST and never replace
   an endpoint.

5. **Signup — not built, by design.** specs screen 1 says "Login / Signup".
   Staff accounts are created by an admin on `/users`; portal contacts are
   created on the customer record. There is no self-service signup and no SSO,
   and CLAUDE.md forbids auth bypasses — do not add one to fill the gap.

6. **Graded docs still missing.** CLAUDE.md lists an architecture diagram and a
   next-steps note under `docs/` as deliverables. Only this handoff exists.
   `README.md` is still a **0-byte file**. This is the cheapest remaining win.

7. **No frontend tests.** CLAUDE.md says frontend tests are out of scope for
   this hackathon. Do not add them. Frontend behaviour is verified with
   Playwright against the running stack (§9).

8. **Commit `bbee2ed` has a malformed subject** — `@ feat: customer book and
   staff directory screens`. A stray `@` from a PowerShell here-string used in a
   bash context. History only; harmless.

### What cleanup removed (do not go looking for these)

An earlier pass deleted every file whose entire content was `export {};`. If a
past note or comment refers to one of these as "a scaffold", the note is stale:

- `backend/src/config/constants.ts`, `discount-engine.types.ts`,
  `src/seed/seed.ts`, `shared/audit/audit.middleware.ts`
- `backend/tests/discount-engine.test.ts` (the real one lives at
  `src/modules/discount-engine/discount-engine.test.ts`)
- `backend/src/modules/integrations/*` — the whole module
- `backend/src/sockets/*`, `frontend/src/lib/socket-client.ts`,
  `shared/types/socket-events.ts`, and both socket dependencies
- `frontend/src/components/shared/*` — seven stub components
- six stub hooks: `useApprovals`, `useFulfillment`, `useInvoices`,
  `useProducts`, `useQuotations`, `useSubscriptions`
- `frontend/src/routes/internal-routes.tsx` — routes live in `App.tsx`
- four stub page components that had been superseded by real ones

---

## 5. Auth and test users

### Two surfaces, two sessions, two secrets

CLAUDE.md rule 4: the customer portal is a **separate surface**. This is the one
boundary where a wrong assumption is expensive.

| | Internal workspace | Customer portal |
|---|---|---|
| Login | `POST /auth/login` | `POST /portal/auth/login` |
| Middleware | `middleware/auth.ts` | `middleware/portal-auth.ts` |
| Secret | `JWT_SECRET` | `PORTAL_TOKEN_SECRET` |
| Token in browser | `localStorage['dealflow360.token']` | `localStorage['dealflow360.portalToken']` |
| Frontend surface arg | `apiGet(path)` (default `'internal'`) | `apiGet(path, 'portal')` |
| Routes | everything except `/portal/*` | `/portal/*` only |

A staff token on `/portal/*` gets **401**. A portal contact cannot reach an
internal endpoint by changing a URL. Portal list endpoints are filtered by
`customerId` **server-side** — a cross-customer detail read is a 404, not a
client-side filter. Keep it that way; client-side scoping here would be a
security hole.

### Role matrix

Frontend role lists live in `frontend/src/routes/access.ts` and are read by both
the nav rail and the route guards, so a hidden nav item and a blocked route can
never disagree. The API guards the same endpoints independently — never rely on
the UI alone.

| Area | SALES_REP | SALES_MANAGER | FINANCE | ADMIN |
|---|---|---|---|---|
| Dashboard, quotations, fulfillment, products, customers, warehouses (read) | ✓ | ✓ | ✓ | ✓ |
| Customer write | ✓ | — | — | ✓ |
| Approvals (screens 5–6) — read the desk | — | ✓ | ✓ | ✓ |
| Approvals — decide a step | — | ✓ | ✓ | — |
| Answer a negotiation request | ✓ | ✓ | — | ✓ |
| Subscriptions, invoices | — | — | ✓ | ✓ |
| Inventory movements (receipts, corrections) | — | — | ✓ | ✓ |
| Deal health — read the board | — | ✓ | ✓ | ✓ |
| Deal health — scan / acknowledge / escalate | — | ✓ | — | ✓ |
| Reports — read and export | — | ✓ | ✓ | ✓ |
| Discount ceilings — read | ✓ | ✓ | ✓ | ✓ |
| Discount ceilings — change | — | — | — | ✓ |
| Staff users / roles | — | — | — | ✓ |

### Seed logins

Every seeded account — staff and portal — shares the password **`dealflow360`**
(hashed with bcrypt in the seed exactly as a real one would be, so login runs the
identical comparison).

**Internal** — `http://localhost:5173/login`

| Email | Name | Role |
|---|---|---|
| `rep@dealflow360.test` | Riya Sales Rep | SALES_REP |
| `manager@dealflow360.test` | Manav Sales Manager | SALES_MANAGER |
| `finance@dealflow360.test` | Farah Finance | FINANCE |
| `admin@dealflow360.test` | Anaya Admin | ADMIN |

**Portal** — `http://localhost:5173/portal/login`

| Email | Contact | Customer | Tier |
|---|---|---|---|
| `aarti@acme.test` | Aarti Buyer | Acme Corp | Gold |
| `gita@globex.test` | Gita Rao | Globex Industries | Silver |
| `ishan@initech.test` | Ishan Mehta | Initech | Bronze |

Three portal contacts on three customers is what lets you prove scoping: log in
as Gita, try to open one of Aarti's quotations by id, expect 404.

---

## 6. Database and seed

Postgres 16 runs in Docker, **Postgres only** — there are no Dockerfiles for the
app, and CLAUDE.md says not to add any.

| Setting | Value |
|---|---|
| Container | `dealflow360-postgres` |
| Host port | **5433** (not 5432) |
| User / password / db | `dealflow` / `dealflow` / `dealflow360` |
| Volume | `dealflow360-pgdata` |

### Commands

```bash
docker compose up -d                    # Postgres only
npm run prisma:migrate -w backend       # prisma migrate dev
npm run prisma:generate -w backend      # regenerate the client after schema edits
npm run seed                            # root alias for: npm run seed -w backend
```

**`npx prisma db seed` does not work.** There is no `prisma.seed` key in
`backend/package.json`, so it silently no-ops and you get an empty database while
believing you seeded it. Always use `npm run seed`.

There is exactly **one migration**, `20260905084248_init`. CLAUDE.md says to ask
before any schema change; a second migration is a real decision, not a detail.

The seed wipes in FK-safe order before writing, and the wipe list covers every
table the app writes — so a reseed leaves no stray alert, negotiation request,
approval step, invoice, payment or audit row behind. A fresh seed is a true
baseline, not a merge.

### What the seed contains

Row counts printed by `npm run seed`:

| | |
|---|---|
| Customer tiers | 3 — Bronze 10%, Silver 12%, Gold 15% |
| Categories | 2 — Hardware, Services |
| Discount rules | 6 — one per tier (10 / 12 / 15), Hardware 15, Services 10, global backstop 5 |
| Roles / users / user-roles | 4 / 4 / 4 |
| Approval chain rules | 3 — **seeded but read by nothing** (§4) |
| Products / variants / subscription plans | 4 / 1 / 3 |
| Customers / contacts | 3 / 3 — Acme (Gold), Globex (Silver), Initech (Bronze) |
| Warehouses / inventory stock | 2 / 4 — WH-MUMBAI, WH-DELHI |
| Quotations / lines | 8 / 11 — Q-2026-0001…0007 DRAFT, Q-2026-0008 CONFIRMED |
| Sales orders / fulfillments | 1 / 1 — the delivery-slippage fixture |
| Risk score factors | 11 |
| Lines over ceiling | 2 |

Every tier's `customer_tier.ceiling_pct` matches its `discount_rule.ceiling_pct`
— the two are kept identical on purpose (§8).

**Q-2026-0001 is the `specs.md` §3 worked example and a load-bearing fixture.**
Acme (Gold), three lines:

| Line | Discount | Applicable ceiling | Overage |
|---|---|---|---|
| Laptop Pro 14 (Hardware) | 12% | 15% | 0 |
| Onsite Setup Service (Services) | 18% | 10% | **8** |
| Extended Warranty (Hardware) | 10% | 15% | 0 |

Blended score **8.00**, risk **HIGH**, max single overage 8, total overage 8.
If a change moves those numbers, the change is wrong — check before you touch it.

Two more fixtures are deliberately shaped: one quotation is 30 days idle so the
stalled-deal detector fires, and the one sales order has a past promised date so
delivery slippage fires. `POST /alerts/scan` opens three alerts on a fresh seed.

### The discount snapshot pass

The seed writes quotation lines through a plain `createMany`, which does not fill
`applicable_ceiling_pct`, `overage_pct` or the `risk_score_factor` rows the
approval screens read. So after the main transaction the seed **replays the
app's own `recomputeQuotation`** over the seeded quotations rather than
duplicating the engine's arithmetic.

Two things to know if you edit it:

- it runs **after** the transaction, because Prisma interactive transactions time
  out at 5 seconds and the pass is slower than that;
- `recomputeQuotation` stamps `lastActivityAt`, which would un-stall the
  deal-health fixture — so the seed restores the original value afterwards.

---

## 7. Running it from a clean clone

```bash
# 1. install (workspaces resolve shared/ into both backend and frontend)
npm install

# 2. generate the Prisma client — there is NO postinstall hook in this repo
npm run prisma:generate -w backend

# 3. environment: copy both examples and fill them in
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. database
docker compose up -d
npm run prisma:migrate -w backend
npm run seed

# 5. run both dev servers
npm run dev
```

`backend/.env` — all five are read in `config/env.ts` and nowhere else:

| Variable | Required | Default |
|---|---|---|
| `DATABASE_URL` | **yes** — throws on boot if missing | — |
| `JWT_SECRET` | **yes** — internal sessions | — |
| `PORTAL_TOKEN_SECRET` | **yes** — portal sessions, deliberately a different secret | — |
| `PORT` | no | `4000` |
| `CORS_ORIGIN` | no, comma-separated list | `http://localhost:5173` |

`frontend/.env`: `VITE_API_URL` (defaults to `http://localhost:4000`).

**Do not touch `.env` files** unless you are asked to.

### Ports and useful commands

| | |
|---|---|
| Backend API | `http://localhost:4000` |
| Frontend | `http://localhost:5173` |
| Postgres | `localhost:5433` |
| Health check | `GET /health` — touches no database |
| Dev-only pages | `/preview`, `/system` |

```bash
npm run dev                        # both servers, colour-tagged
npm run typecheck                  # shared + backend + frontend
npm run build                      # all three
npm test -w backend                # vitest — 24 tests, 4 files
npm run build -w @dealflow360/shared   # AFTER any shared/ type edit — see below
```

**`shared/` compiles to a CommonJS `dist/`.** If you edit a type in `shared/` and
do not rebuild it, the backend typechecks against the stale build and you will
chase a phantom error. Rebuild it, then typecheck.

A related trap: shared enums are real TypeScript `enum`s, but Prisma's are string
unions, and the Vite dev server **cannot import enum values** out of the
CommonJS package — doing so blanks the whole app with
`does not provide an export named '…'`. The established idiom is to import the
enum as a *type* and cast literals at the edge — `'NEGOTIATION' as QuotationStatus`
in the frontend, `row.type as AlertTypeView` in a backend view mapper. Follow it
rather than inventing a third approach.

---

## 8. Conventions you must follow

Most of these are in CLAUDE.md; this is the working summary.

**API shape.** Every endpoint answers `{ data, error }` — `data` on success,
`error` on failure, never both. Lists add `meta`: `{ data: [], meta: { total } }`.
The single exception is `GET /reports/export`, which answers with a file and sets
`Content-Type` plus an attachment `Content-Disposition` (which is CORS-exposed in
`app.ts` — it is not a safelisted response header, and without that the browser
saves the file under the wrong name).

**Naming.** `camelCase` in TypeScript, `snake_case` in the database, Prisma
`@map` between them. Never write a raw snake_case field in application code.

**Money is `Decimal`, never `Float`.** It serialises to JSON as a **string**;
compare with `Number(...)` or `.toFixed(2)`, not with `===` against a literal.
Formatting for display belongs in `frontend/src/lib/format.ts` and nowhere else.

**Percentages are decimal percent** — `12.5` means 12.5%, not 0.125.

**Enums are declared once** in `shared/types/` and mirrored as Prisma enums.
No loose status strings.

**Errors.** Throw the typed errors from `lib/errors.ts`
(`NotFoundError`, `ValidationError`, `ConflictError`, `UnauthorizedError`,
`ForbiddenError`); `middleware/error-handler.ts` turns them into responses. It
also maps body-parser's own failures — a malformed JSON body is 400, not 500 —
while anything unrecognised still gets the generic 500.

**Thin controllers.** Parse, delegate, respond. No Prisma and no business logic
in a controller, and none in a React component.

**Every mutation that matters writes `audit_log`** via
`shared/audit/audit.service.ts`, with the acting user, a reason and a
before/after `changes` map. Fourteen services write it today. Approvals,
rejections, returns, discount edits, ceiling changes, negotiation answers and
manual fulfillment overrides are all on the record.

**REST only.** Every mutation goes through a REST endpoint.

**Reuse the engines.** Never duplicate or modify engine arithmetic to make a
caller easier. If you need what an engine knows, call it.

**Nothing hardcoded.** No result faked to make a demo pass, no seeded backdoor,
no "demo mode" flag.

### Testing bar

`npm test -w backend` — **24 tests across 4 files**:

| File | Tests | Covers |
|---|---|---|
| `src/modules/discount-engine/discount-engine.test.ts` | 3 | the `specs.md` worked example, and a "many small overages" case proving the blended score is not simply max-of-line |
| `tests/fulfillment-split.test.ts` | 6 | a split across two warehouses, and a backorder case |
| `tests/subscription-proration.test.ts` | 7 | mid-cycle plan changes |
| `tests/negotiation.test.ts` | 8 | answering a counter: priced within the ceiling, a breach re-entering approval at Sales Manager + Finance, a small breach routing to the manager alone, rejection, a counter-less request, a concurrent-answer conflict, a quote past negotiation, and a missing request |

`tests/negotiation.test.ts` stands its database up in memory but drives the real
`computeDiscountRisk` over real ceilings, so whether a counter breaches is the
engine's own answer. If you add a service test, do the same — mocking the
decision tests nothing.

`backend/vitest.config.ts` lists test files explicitly. A new file under
`backend/tests/` must be added to `include` or it will not run.

---

## 9. How work is verified here

Unit tests cover the pure logic. Everything else is verified by **actually
running it** — the API with `fetch` scripts, the UI with Playwright against the
live dev stack. "It typechecks" is not verification.

### Browser verification with Playwright

Playwright is a root devDependency. Verification scripts are written to a
scratch directory and driven from the CLI — **they are never committed to the
repository** (frontend tests are out of scope; these are throwaway proof runs).

```js
import { chromium } from 'file:///<repo>/node_modules/@playwright/test/index.mjs';
```

Every run asserts **zero console errors and zero `pageerror` events** alongside
its behavioural checks. That single assertion has caught real bugs that no
typecheck would — including a blank-screen crash from importing a shared enum as
a value.

Prefer accessible selectors — `getByRole('table', { name: … })`,
`getByLabel(…)` — and give tables an `aria-label` so they can be addressed.

### No empty or dead functionality

The standard applied throughout, and the one to keep:

- every button does something
- every section shows real data or a real empty state
- no placeholder text, no "coming soon", no disabled control standing in for a
  feature
- if the backend cannot supply it, it does not go in the UI at all

When something genuinely cannot be built — no endpoint, or a role that cannot
read the data — say so in the report rather than shipping a dead control. The
approval-chains section on screen 18 is the model: it is read-only and says why,
rather than offering an edit that would fail.

---

## 10. Git state

| | |
|---|---|
| Branch | `main` |
| Last commit | `9c5ab50 fix: complete seed wipe list for clean reseed` |
| Remote | `https://github.com/amarnotcool/DealFlow360_trial.git` |
| Working tree | clean, and pushed |

Recent history, newest first:

```
9c5ab50 fix: complete seed wipe list for clean reseed
b1d5735 chore: remove unused integrations module stub
0ce76ef chore: remove unused socket scaffolding and dependencies (manifests)
33c7dad chore: remove unused socket scaffolding and dependencies
84ed029 chore: remove unused shared components and stub hooks
58d368d chore: remove dead stub files
73d7a1b test: negotiation response coverage
e9f1a29 fix: malformed JSON returns 400
80cdfba feat: discount tier/ceiling config (screen 18 phase 1)
43fcbf4 feat: live notification bell
```

---

## Suggested first moves

1. Read `CLAUDE.md`, `specs.md`, `DESIGN.md`.
2. Get it running (§7), log in as `manager@dealflow360.test`, and click through
   Dashboard → Quotations → Approvals → Fulfillment → Reports to see the shape of
   the thing. Then log in as `admin@dealflow360.test` for screen 18.
3. Then, in the order that buys the most:
   - the graded `docs/` deliverables and a real `README.md` (§4 item 6) — the
     cheapest points left on the table;
   - price lists (§4 item 3) — screen 17 has a section that is always empty;
   - approval-chain configuration (§4 item 1) — **ask before starting**, it
     changes what the discount engine takes as input.
