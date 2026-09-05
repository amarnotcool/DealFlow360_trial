# DealFlow360 — Handoff

Written for the next coding agent picking this repository up. It records what is
true in the working tree today, not what is planned. Where something is missing
or half-built it says so plainly.

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
| Monorepo | npm workspaces | `shared`, `backend`, `frontend` |
| Tests | Vitest | 3.x, backend only |
| Browser verification | Playwright | 1.63, root devDependency |

`socket.io` is installed in `backend/package.json` but **no socket code exists**
(see §4). Treat the stack as REST-only today.

---

## 2. Repository structure

```
dealflow360/
├── CLAUDE.md            rules — read first
├── specs.md             product requirements + data model
├── DESIGN.md            visual system
├── README.md            EMPTY (0 bytes)
├── docker-compose.yml   Postgres 16 only, host port 5433
├── docs/                this file (the only file here)
├── shared/              @dealflow360/shared — types crossing FE/BE
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/20260905084248_init/   (one migration, that is all)
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts       Express wiring; every module mounted here
│   │   ├── server.ts    listen only
│   │   ├── config/env.ts   the ONLY place process.env is read
│   │   ├── lib/         errors, async-handler, jwt, password, prisma-client
│   │   ├── middleware/  auth, portal-auth, rbac, validate, error-handler
│   │   ├── shared/audit/audit.service.ts
│   │   └── modules/<name>/
│   └── tests/
└── frontend/src/
    ├── App.tsx          all internal routes
    ├── components/ui/   the primitive set — reuse these
    ├── components/layout/  InternalLayout, InternalNav, PortalLayout
    ├── features/<domain>/   *.api.ts + use*.ts hooks
    ├── pages/internal/<domain>/  list + detail pairs
    ├── pages/portal/    the separate customer surface
    ├── lib/             api-client.ts, format.ts
    └── routes/          access.ts (role lists), guards.tsx
```

### Backend module shape

Every module in `backend/src/modules/<name>/` follows one shape:

```
<name>.controller.ts   HTTP only: read parsed request, call service, respond
<name>.service.ts      business logic + Prisma
<name>.routes.ts       routes, with guards applied here
<name>.schemas.ts      zod schemas (most modules)
```

Controllers are thin. **No Prisma and no business logic in a controller.**

Guards are **path-scoped**, never bare. This pattern is load-bearing — a bare
`router.use(auth)` would leak onto other modules' routes:

```ts
reportingRoutes.use('/reports', auth, requireRole('SALES_MANAGER', 'FINANCE', 'ADMIN'));
```

### Frontend shape

Each domain is a **list + detail pair** under `pages/internal/<domain>/`, with
its API calls and hooks in `features/<domain>/`. Screens hold layout; hooks hold
state and fetching.

### The three pure engines — do not put I/O in these

These files contain algorithms only. **No Prisma, no Express, no I/O.** Plain
objects in, plain objects out. They are what proves correctness to judges, and
they are the reason the logic is not duplicated anywhere else.

| File | What it computes |
|---|---|
| `backend/src/modules/discount-engine/discount-engine.service.ts` | Blended risk score (specs §3), per-line ceiling/overage, required approval chain |
| `backend/src/modules/fulfillment/split-allocator.ts` | Multi-warehouse split and backorder allocation |
| `backend/src/modules/subscriptions/proration.ts` | Subscription proration on upgrade/downgrade/cancel |

Services call them. They call nothing. If you need a ceiling looked up, the
**caller** resolves it and passes it in — see `loadCeilings()` in
`quotations.service.ts` for the pattern.

---

## 3. What is built — module checklist

Status is judged from the code, not intent. "Scaffold" means the file exists but
its whole content is `export {};`.

| Module | Backend | Frontend | specs §6 screens |
|---|---|---|---|
| Auth (internal) | Complete — `POST /auth/login`, `GET /auth/me`, JWT | Complete — `Login.tsx` | 1 (internal half) |
| RBAC / staff users | Complete — `/users` CRUD, `/roles`; **ADMIN only** | Complete — list, detail, create | — |
| Quotations | Complete — list, detail, create, line add/edit/delete, submit, confirm | Complete — list grouped by stage, detail with live `OVER (+Npt)` badges | 3, 4 (partial — no upsell panel) |
| Approvals | Complete — list, detail, approve / return / reject | Complete — incl. per-line "why flagged" breakdown from `risk_score_factor` | 5, 6 (partial — no audit-trail view) |
| Fulfillment | Complete — split suggestion, accept, manual override, ship, backorder consolidation | Complete — list + detail | 7, 8 |
| Warehouses / inventory | Complete — warehouse CRUD, stock receipts, corrections, reserved floor enforced | Complete — list, detail, stock modals, backorder consolidation | (supports 7, 8) |
| Subscriptions | Complete — list, detail, change, cancel, generate-invoice | Complete — list + detail | 9, 10 (see gap below) |
| Billing / invoices | Complete — list, detail, `POST /invoices/:id/pay`, `/orders/:id/billing` | Complete — list, detail with progress timeline, record payment | 12, 13 |
| Customer portal | Complete — `/portal/quotations`, detail, negotiate, confirm; separate `portal-auth` | Complete — Overview, My Quotations, Negotiation, Messages, Profile | 11 |
| Products / catalogue | Complete — CRUD, variants, categories, price lists | Complete — catalogue, detail, create | 16, 17 |
| Customers | Complete — CRUD + contacts | Complete — book, detail, create | — |
| Deal health | Complete — 3 detectors, idempotent `POST /alerts/scan`, acknowledge, escalate | Complete — alert board with type filter | 14 |
| Reporting | Complete — `/reports/summary`, `/quotations`, `/discounts`, `/owners`, `/export?format=pdf` | Complete — filters, metric cards, discount analysis, breakdown, Export PDF | 15 (PDF only, no XLS) |
| **Sales dashboard** | n/a | **Scaffold** — `pages/internal/Dashboard.tsx` is `export {};`, nav item disabled | **2 — NOT BUILT** |
| **Discount tiers config** | **Scaffold** — whole `discount-tiers` module | **Scaffold** — `DiscountTiersConfig.tsx` | **18 — NOT BUILT** |
| **Recommendations / upsell** | **Scaffold** — whole `recommendations` module | **Scaffold** — `UpsellPanel.tsx` | part of 4 — **NOT BUILT** |
| **Integrations (ERP)** | **Scaffold** | none | bonus — not built |
| Sockets | **Scaffold** — `sockets/index.ts`, `quotation.gateway.ts` | **Scaffold** — `lib/socket-client.ts`, `shared/types/socket-events.ts` | — |

Note: the `negotiation`, `portal-messages` and `portal-profile` backend modules
are empty scaffolds, but **the features they name are built elsewhere** and work:

- negotiation lives in `portal.service.ts` (`POST /portal/quotations/:id/negotiate`)
- portal Messages reads the negotiation history off the quotations the customer
  can already open — there is deliberately no separate messages endpoint
- portal Profile reads `GET /portal/auth/me` and is read-only by design

Do not "fill in" those scaffolds without checking whether you would be building
a second copy of something that already works.

### specs §7 acceptance flow — 8 steps

| # | Step | Status |
|---|---|---|
| 1 | Log in, set up a discount tier / warehouse / subscription plan | **Partial.** Login, warehouses and products work in the UI. Tiers and approval chains are seed-only — screen 18 does not exist, so there is no UI to create a tier. |
| 2 | Create a quotation with a discount higher than allowed | **Passes.** |
| 3 | Confirm the quote automatically requests manager approval | **Passes.** Submit runs the engine and raises the chain; the rep never asks. |
| 4 | Accept an upsell suggestion, total and margin update immediately | **Fails.** There is no upsell/recommendation feature. Totals and margin *do* recompute server-side on every line change, so the second half of the step holds. |
| 5 | Approve, then confirm stock splits across warehouses | **Passes.** |
| 6 | One-time + recurring on one order billed separately | **Passes.** |
| 7 | Portal counter-discount re-enters approval automatically | **Passes** at the API level and in the portal UI. See the testing gap in §4. |
| 8 | Confirm order, record payment, invoice status updates | **Passes.** |

So **6 of 8 pass end to end**, step 1 partially, and step 4 is blocked on the
missing upsell feature. If you have time for one feature, upsell is the one that
buys back an acceptance step.

---

## 4. Known gaps and issues

Ordered by how much they cost.

1. **Upsell / product recommendations — not built.** The `ProductRecommendation`
   table exists in the schema and `products.service.ts` counts rows against it
   for delete-safety, but there is no endpoint and no UI. Blocks acceptance
   step 4 and half of screen 4.

2. **Sales Dashboard (screen 2) — not built.** `pages/internal/Dashboard.tsx` is
   an empty scaffold and the nav pill is rendered disabled. specs' internal nav
   lists Dashboard first, so this is the most visible hole in the demo.

3. **Discount Tiers & Approval Chains (screen 18) — not built.** Tiers,
   category ceilings and approval-chain rules can only be changed by editing the
   seed. The whole `discount-tiers` backend module is a scaffold.

4. **`backend/tests/negotiation.test.ts` is an empty file**, and
   `backend/vitest.config.ts` deliberately excludes it. CLAUDE.md's testing bar
   names it as required: *"a counter-discount that pushes terms past threshold
   re-enters approval"*. The behaviour is implemented and has been verified
   manually through the API, but it has no unit test. `tests/discount-engine.test.ts`
   is also empty — the real one lives at
   `src/modules/discount-engine/discount-engine.test.ts`.

5. **Audit-trail UI — not built.** `audit_log` is written by twelve services and
   is correct, but nothing renders it. Screen 6 asks for an audit trail on the
   approval detail; today that screen only says decisions are recorded.
   `pages/internal/approvals/components/AuditTrail.tsx` is an empty scaffold.

6. **XLS export — not built.** specs screen 15 says "Export PDF / XLS". Only PDF
   exists. `GET /reports/export?format=xls` deliberately returns **400** rather
   than handing back a PDF under an XLS name.

7. **Malformed JSON returns 500 instead of 400.** `error-handler.ts` only
   special-cases `AppError`; body-parser's `entity.parse.failed` (which already
   carries `statusCode: 400`) falls through to the generic 500 branch.
   Reproduce: `curl -X POST localhost:4000/auth/login -H 'content-type: application/json' -d '{"bad json'`.
   Fix is a few lines in the error handler.

8. **No sockets.** CLAUDE.md rule 6 describes a socket layer for live margin
   recalculation, approval status pushes and new deal-health alerts. None of it
   exists: `sockets/index.ts`, `quotation.gateway.ts`, `lib/socket-client.ts`
   and `shared/types/socket-events.ts` are all empty scaffolds. Screen 4's
   "checked live as it is typed" is satisfied by a REST round-trip per line
   edit (the server recomputes and returns the new ceiling/overage), not by a
   keystroke-level preview. If you add sockets, they layer **on top of** REST —
   they never replace an endpoint.

9. **`docs/` was empty until this file.** CLAUDE.md lists an architecture
   diagram and a next-steps note as graded deliverables. Both are still missing.

10. **`README.md` is a 0-byte file.**

11. **Commit `bbee2ed` has a malformed subject** — `@ feat: customer book and
    staff directory screens`. A stray `@` from a PowerShell here-string used in
    a bash context. History only; harmless.

12. **Uncommitted work in the tree.** `backend/prisma/seed.ts` is modified and
    not yet committed (see §10).

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
| Quotations, fulfillment, products, customers, warehouses (read) | ✓ | ✓ | ✓ | ✓ |
| Customer write | ✓ | — | — | ✓ |
| Approvals (screens 5–6) | — | ✓ | ✓ | ✓ |
| Subscriptions, invoices | — | — | ✓ | ✓ |
| Inventory movements (receipts, corrections) | — | — | ✓ | ✓ |
| Deal health — read the board | — | ✓ | ✓ | ✓ |
| Deal health — scan / acknowledge / escalate | — | ✓ | — | ✓ |
| Reports — read and export | — | ✓ | ✓ | ✓ |
| Staff users / roles | — | — | — | ✓ |

### Seed logins

Every seeded account shares the password **`dealflow360`** (hashed with bcrypt in
the seed exactly as a real one would be, so login runs the identical comparison).

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

Two portal contacts on different customers is what lets you prove scoping: log in
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

### What the seed contains

- 3 customer tiers: Bronze 10%, Silver 12%, Gold 15%
- 2 categories: Hardware (ceiling 15%), Services (ceiling 10%)
- 6 discount rules: one per tier, one per category, plus a 5% global backstop
- 4 staff users, 4 roles, 3 approval-chain rules
- 4 products (one with a variant), 3 subscription plans
- 3 customers with one portal contact each
- 2 warehouses (WH-Mumbai, WH-Delhi) with stock shaped so an order of 10 laptops
  must split across both, and warranty stock low enough to force a backorder
- 8 quotations and 1 sales order

| Quotation | Customer | Purpose |
|---|---|---|
| **Q-2026-0001** | Acme (Gold) | **The specs §3 worked example — the risk fixture.** 3 lines; the Services line at 18% breaks its own 10% ceiling by 8 points, giving blended score **8.00 / HIGH**. Do not change this quote's numbers. |
| Q-2026-0002 | Acme | Hybrid billing: one one-time line + one recurring line, both at list price |
| Q-2026-0003 | Globex (Silver) | Deal health STALLED_DEAL — `lastActivityAt` backdated 30 days, still DRAFT |
| Q-2026-0004/5/6 | Initech (Bronze) | Ordinary 8% quotes, giving the rep a discount average |
| Q-2026-0007 | Initech (Bronze) | Deal health DISCOUNT_ANOMALY — 40% against that average; 30 points over the Bronze ceiling, blended **30.00 / HIGH** |
| Q-2026-0008 + SO-2026-0001 | Acme | Deal health DELIVERY_SLIPPAGE — confirmed order, one reserved shipment promised 10 days ago and unshipped |

A scan on a fresh seed opens **exactly three alerts**, one of each type.

### The discount snapshot pass

Rows are written straight into the tables, so nothing would have run the discount
engine over them — every line would carry a zero ceiling and a zero overage, and
reporting would show no over-limit lines while the data plainly held some.

So `main()` ends with a pass that hands each seeded quotation to
**`recomputeQuotation()`** — the same function the API runs after every edit. The
maths is not written a second time in the seed. It fills per-line ceiling and
overage, blended score, risk level, the approval flag and the `risk_score_factor`
rows, and **nothing else**: no status changes, no quote is auto-submitted, no
approval step is raised.

Two things to know if you touch it:

- It runs **after** the seed transaction. The wipe and the inserts already fill
  that transaction and Prisma's interactive transactions time out at five seconds.
- `recomputeQuotation()` stamps `lastActivityAt`, which is correct for a real
  edit but would un-stall the 30-day-idle deal-health fixture. Each quotation's
  `lastActivityAt` is captured before and restored after. Keep that guard.

The seed is **idempotent**: every run wipes the seeded tables and reinserts, so
running it twice leaves the same rows and the same numbers.

**Before reseeding, ask.** Someone may have a dev server up with state they care
about, and the wipe takes the whole database.

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

**Do not touch `.env` files or the empty scaffolds under `backend/tests/`**
unless you are actually implementing the test that belongs there.

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
npm test -w backend                # vitest, 16 tests
npm run build -w @dealflow360/shared   # AFTER any shared/ type edit — see below
```

**`shared/` compiles to a CommonJS `dist/`.** If you edit a type in `shared/` and
do not rebuild it, the backend typechecks against the stale build and you will
chase a phantom error. Rebuild it, then typecheck.

A related trap: shared enums are real TypeScript `enum`s, but Prisma's are string
unions, and the Vite build cannot import enum *values* out of the CommonJS
package. The established idiom is to cast literals at the edge —
`'STALLED_DEAL' as AlertType` in the frontend, `row.type as AlertTypeView` in a
backend view mapper. Follow it rather than inventing a third approach.

---

## 8. Conventions you must follow

Most of these are in CLAUDE.md; this is the working summary.

**API shape.** Every endpoint answers `{ data, error }` — `data` on success,
`error` on failure, never both. Lists add `meta`: `{ data: [], meta: { total } }`.
The single exception is `GET /reports/export`, which answers with a file and sets
`Content-Type: application/pdf` plus an attachment `Content-Disposition`.

**Naming.** `camelCase` in TypeScript, `snake_case` in the database, Prisma
`@map` between them. Never write snake_case in TS or camelCase in a migration.

**Money is `Decimal`, never `Float`.** It serialises to JSON as a **string** —
keep it a string across the wire and format it for display in `lib/format.ts`
only. Never parse money into a float to render it.

**Percentages are decimal percent**, not fractions: `12.5` means 12.5%.

**Enums** are declared in `shared/types/` and mirrored as Prisma enums. No loose
strings.

**Shared types are shared.** Anything crossing the FE/BE boundary belongs in
`shared/types/`. Never redefine a `Quotation` or `RiskScore` shape in the
frontend.

**Errors** are thrown as typed errors from `lib/errors.ts` (`NotFoundError`,
`ValidationError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`);
`error-handler.ts` converts them to responses.

**Everything auditable is audited.** Approvals, rejections, returns, discount
edits, manual fulfillment overrides, stock movements, deal-health actions — all
write to `audit_log` via `shared/audit/audit.service.ts` with user, timestamp and
reason. Prisma wants `Prisma.InputJsonValue` for the `changes` column; the idiom
in this codebase is `JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue`.

**REST first.** All mutations go through REST. Sockets, if they ever land, are a
layer on top and never replace an endpoint.

**Reuse the engines.** If you find yourself computing an overage, a split or a
proration, stop — one of the three pure engines already does it. Duplicated
business maths is the single worst thing you can add to this repo.

**Never hardcode a demo result.** No faked split results, no stubbed billing
schedules, no "demo mode" flags, no seeded admin backdoors, no auth bypasses.

**Do not expand scope.** No multi-currency, no multi-company, no new frameworks
or state libraries, no Dockerfiles for the app. Prefer the standard library and
what is already installed over a new dependency.

**Ask, do not guess**, on: schema changes, anything touching the blended risk
score, and anything that moves the portal/internal auth boundary. Those three are
expensive to unwind.

### Testing bar

`npm test -w backend` — **16 tests, all green today.** Frontend tests are
explicitly out of scope; do not add them.

| File | Covers |
|---|---|
| `src/modules/discount-engine/discount-engine.test.ts` | 3 tests — the specs §3 worked example, plus a "many small overages" case proving the blended score is not just max-of-line |
| `tests/fulfillment-split.test.ts` | 6 tests — split across two warehouses, and a backorder case |
| `tests/subscription-proration.test.ts` | 7 tests — upgrade, downgrade, cancellation |
| `tests/negotiation.test.ts` | **empty, and excluded in `vitest.config.ts`** — the required counter-discount-re-enters-approval test is still owed |

When you fill a scaffolded test file, add it to the `include` list in
`backend/vitest.config.ts` — the config lists only the scaffolds actually written.

---

## 9. How work is verified here

Two standards have been applied to every screen so far. Hold them.

### Browser verification with Playwright

Playwright is a root devDependency and is driven **from CLI scripts, not a test
suite** — there is no `playwright.config.ts` and no committed spec files. The
established pattern:

- Write the script in a scratch directory, **never in the repo**. No verification
  script has ever been committed and none should be.
- Import from the absolute path:
  `import { chromium } from 'file:///.../node_modules/@playwright/test/index.mjs'`
- Run it against the already-running dev stack (`:4000` API, `:5173` app).
- Collect `console` errors and `pageerror` events and assert **zero** of each,
  filtering known noise (`React DevTools`, `vite`, `[hmr]`).
- Take full-page screenshots and actually look at them — several real design bugs
  (all-blue tier badges, an invisible dark badge on a dark card, a mislabelled
  notice) were only ever caught by reading a screenshot.
- Assert against the API's own numbers rather than hardcoded values, so the
  script survives a reseed.

Gotchas already paid for: `selectOption({ label: /regex/ })` is unsupported; CSS
`text-transform: uppercase` changes `innerText`; a `<select>` nested in a
`<label>` absorbs its option text into the accessible name, so every select needs
an explicit `aria-label`; browser contexts share `localStorage`; and a list
re-reads after a filter click, so waiting for "the rows changed" hangs whenever a
filter legitimately selects the same set — wait for the API response and then for
the DOM to match it.

### No empty or dead functionality

This is the hard rule for any screen you build:

- Every button does something real.
- Every section shows either data or a written empty state — never a blank panel.
- No placeholders, no "coming soon", no disabled controls standing in for a
  feature.
- **If the backend does not provide it, do not put it in the UI.** Building a
  control with nothing behind it is worse than leaving it out.
- Loading and error states are handled everywhere via the shared `LoadingCard`,
  `ErrorCard` and `EmptyCard` primitives.

When something genuinely cannot be built — no endpoint, a role that cannot read
the data — say so in the report rather than shipping a dead control.

---

## 10. Git state

| | |
|---|---|
| Branch | `main` |
| Last commit | `506a5cb feat: admin reporting dashboard` |
| Remote | `https://github.com/amarnotcool/DealFlow360_trial.git` |
| Working tree | **not clean** — one modified file (below) |

```
 M backend/prisma/seed.ts
```

That change is the discount-snapshot pass described in §6 plus the Bronze (10%)
and Silver (12%) tier discount rules. It has been verified — 57/57 snapshot
checks, 124/124 reporting backend, 65/65 reporting UI, 28/28 deal health, 16 unit
tests, typecheck and build clean, seed idempotent across three runs — but it was
**not committed**, because the commit was never asked for. Commit it or discard
it deliberately; do not let it drift.

Recent history, newest first:

```
506a5cb feat: admin reporting dashboard
7bbf865 feat: admin reporting and the PDF export of it
ff6995b feat: deal health dashboard screen
3170d64 feat: deal health alerts and the promised dates they measure
260fab4 feat: customer portal dashboard (Overview)
21fbcea feat: warehouse, inventory and backorder consolidation screens
11a96fe feat: stock receipts, corrections and backorder consolidation
bbee2ed @ feat: customer book and staff directory screens
ca232bf feat: customer book and staff user directory
d0977ae feat: product catalogue screens and a real add-line picker
```

---

## Suggested first moves

1. Read `CLAUDE.md`, `specs.md`, `DESIGN.md`.
2. Get it running (§7), log in as `manager@dealflow360.test`, and click through
   Quotations → Approvals → Fulfillment → Reports to see the shape of the thing.
3. Decide what to do with the uncommitted `seed.ts` change (§10).
4. Then, in the order that buys the most: the upsell panel (unblocks acceptance
   step 4), the Sales Dashboard (screen 2, the most visible hole), the
   negotiation test (§4 item 4), and the malformed-JSON 400 fix (§4 item 7, a
   few lines).
