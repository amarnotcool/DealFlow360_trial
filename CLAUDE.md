# CLAUDE.md — DealFlow360

Instructions for Claude Code working in this repository.
Read this before making any change. Read `specs.md` for product requirements and business rules.

---

## What this project is

DealFlow360 is a B2B Sales Operations platform built for the Odoo hackathon. It covers the full
quotation-to-cash flow: quote building → multi-tier discount approval → multi-warehouse fulfillment →
hybrid one-time + subscription billing → customer-facing portal negotiation → deal health monitoring.

The judged differentiator is **business logic correctness**, not UI polish. Discount governance,
warehouse splitting, and billing proration must be implemented in real application logic —
never hardcoded, faked, or stubbed to make the demo pass.

---

## Tech stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript, REST + WebSocket |
| Database | PostgreSQL + Prisma ORM |
| Monorepo | npm workspaces (`frontend`, `backend`, `shared`) |
| Local DB | Docker Compose (Postgres only) or hosted Postgres |

Do not introduce alternative frameworks, ORMs, state libraries, or UI kits without being asked.
Prefer the standard library and what is already installed over adding a dependency.

---

## Repository layout

```
dealflow360/
├── shared/          # TypeScript types shared by FE and BE (@dealflow360/shared)
├── backend/         # Express API, Prisma schema, business logic
├── frontend/        # React app: internal workspace + customer portal
└── docs/            # architecture diagram + next-steps note (graded deliverables)
```

Backend modules live in `backend/src/modules/<name>/` and follow one shape:

```
<name>.controller.ts   # HTTP layer only: parse request, call service, shape response
<name>.service.ts      # business logic + Prisma access
<name>.routes.ts       # route definitions, guards applied here
```

Frontend screens live in `frontend/src/pages/internal/<domain>/` as **list + detail pairs**
(every module in the UI is one list screen and one detail screen opened by clicking a row).
Domain API calls and hooks live in `frontend/src/features/<domain>/`.

---

## Core architectural rules

**1. Pure business logic stays pure.**
These three files contain algorithms and must have **no Prisma, no Express, no I/O**:

- `backend/src/modules/discount-engine/discount-engine.service.ts`
- `backend/src/modules/fulfillment/split-allocator.ts`
- `backend/src/modules/subscriptions/proration.ts`

They take plain objects in and return plain objects out. Services call them; they call nothing.
This makes them unit-testable and lets us prove correctness to judges directly.

**2. Controllers are thin.**
No business logic, no Prisma calls in controllers. Parse, delegate, respond.

**3. Types are shared, not duplicated.**
Any type crossing the FE/BE boundary belongs in `shared/types/`. Never redefine a
`Quotation` or `RiskScore` shape in the frontend.

**4. The customer portal is a separate surface.**
Portal routes use `portal-auth` middleware, not internal `auth`. A customer must never be able to
reach an internal endpoint by changing a URL. Portal pages live under `pages/portal/` with their
own layout and nav — not an internal page with a different theme.

**5. Everything auditable is audited.**
Approvals, rejections, returns, discount edits, and manual fulfillment overrides all write to
`audit_log` with user, timestamp, and reason. Use `shared/audit/audit.service.ts`.

**6. REST first, sockets as a layer on top.**
All mutations go through REST. After a mutation that changes live state, emit a socket event to
the `quotation:{id}` room. Sockets never replace REST endpoints.

Socket events are limited to:
- live margin / blended risk recalculation while building a quote
- approval status changes (pushed to rep and to portal if open)
- new deal-health alerts

Everything else — product CRUD, warehouse config, reports — is plain REST.

---

## Conventions

- **Naming**: `camelCase` in TypeScript, `snake_case` in the database. Prisma maps between them.
- **Money**: store as `Decimal` in Prisma, never `Float`. Format for display in `lib/format.ts` only.
- **Percentages**: stored as decimal percent values (e.g. `12.5` means 12.5%), not fractions.
- **Enums**: define status enums in `shared/types/`, mirrored as Prisma enums. Do not use loose strings.
- **Errors**: throw typed errors from `lib/errors.ts`; `error-handler.ts` converts them to responses.
- **API shape**: every endpoint returns `{ data, error }`. Lists return `{ data: [], meta: { total } }`.
- **List/detail**: every module exposes `GET /<resource>` (list) and `GET /<resource>/:id` (detail).

---

## Build order

Work in this sequence. Each step blocks the next.

1. Root workspace setup — confirm `shared/` resolves from both `frontend` and `backend`
2. Postgres running + `schema.prisma` written + first migration applied
3. `seed.ts` — the worked example from `specs.md` (Gold customer, Laptop + Setup Service, 2 warehouses)
4. `discount-engine.service.ts` + `discount-engine.test.ts` — green before any controller is written
5. Thin vertical slice: `/health` endpoint → React shell renders it (proves CORS, env, ports)
6. Then modules in parallel: quotations+approvals, fulfillment, subscriptions+billing, portal+auth

Do not skip ahead to UI work before step 4 passes.

---

## Testing

Minimum bar — these must exist and pass:

- `discount-engine.test.ts` — the `specs.md` worked example, plus a "many small overages" case
  proving the blended score is not simply max-of-line
- `fulfillment-split.test.ts` — split across two warehouses, and a backorder case
- `negotiation.test.ts` — a counter-discount that pushes terms past threshold re-enters approval

Frontend tests are out of scope for this hackathon. Do not add them.

---

## Things not to do

- Do not hardcode discount decisions, split results, or billing schedules to make a demo pass
- Do not put business logic in controllers or React components
- Do not add auth bypasses, seeded admin backdoors, or "demo mode" flags
- Do not add Dockerfiles for frontend/backend — Docker is used for Postgres only
- Do not build multi-currency or multi-company support (explicitly a bonus, not a requirement)
- Do not expand scope into features not in `specs.md` without being asked

---

## When you are unsure

Prefer asking over guessing on: schema changes, anything touching the blended risk score,
and anything that changes the portal/internal auth boundary. These three are the areas where a
wrong assumption is expensive to unwind.

For everything else, make the smallest change that works and note the assumption in your response.
