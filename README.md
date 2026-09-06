# DealFlow360

A B2B sales operations platform: quotation → multi-tier discount approval →
multi-warehouse fulfillment → hybrid one-time + subscription billing →
customer-facing portal negotiation → deal health monitoring.

Built for the Odoo hackathon. The whole quote-to-cash chain runs end to end on a
seeded database — a rep prices a quote, the discount engine routes it for
approval on its own, stock is split across warehouses, the order bills its
one-time and recurring parts separately, the customer negotiates from their own
portal, and payment closes the invoice.

---

## The idea

Most quoting tools let a rep type any discount and ask a manager to eyeball it.
The interesting problem is **governance**: which discounts are allowed, who has
to sign off, and what happens when a customer negotiates after the fact.

Three decisions are the product, and all three are real algorithms rather than
rules of thumb:

### 1. Blended discount risk

A line is measured against the **tighter** of its customer's tier ceiling and its
product category's ceiling. Anything above that is the line's *overage*. The
quotation's risk is not the worst line and not the sum — it is a blend:

```
blended score = 0.6 × (worst single line's overage) + 0.4 × (total overage)
```

That matters because both failure modes are real. One outrageous line is a
problem, and so is a quote where ten lines each slip three points and nobody
notices. Weighting only the worst line misses the second; summing misses the
first.

The score picks the approval chain: `0` auto-approves, anything below `5.00`
routes to the Sales Manager, `5.00` and above adds Finance. **The rep never
clicks "request approval"** — submitting runs the engine and raises the chain.

*Worked example (`specs.md` §3, seeded as `Q-2026-0001`):* a Gold customer with
three lines — Laptop at 12% against a 15% ceiling, Onsite Setup at 18% against a
10% ceiling, Warranty at 10% against 15%. One line is 8 points over, so the
blend is `0.6 × 8 + 0.4 × 8 = 8.00` — **HIGH**, Sales Manager then Finance.

### 2. Multi-warehouse split allocation

Confirming an order asks the allocator where the stock actually is. It fills
each line from the deepest stock first so the order opens as few shipments as
possible, prefers one cheaper warehouse over a split when a single site can
cover the line, reuses a warehouse already opened for another line rather than
adding a shipment, never promises the same stock to two lines, and backorders
whatever is genuinely short.

### 3. Subscription proration

A plan change mid-cycle is priced for the part of the cycle that is left —
charging the difference on an upgrade, crediting it on a downgrade, crediting
the unused remainder on cancellation, and charging nothing when the change lands
exactly on a cycle boundary.

**All three are pure functions** — plain objects in, plain objects out, no
database and no framework — so they are unit-tested directly and can be shown to
be correct rather than demonstrated to be plausible.

---

## Running it

Prerequisites: Node 20+, Docker (for Postgres only — the app itself is not
containerised).

```bash
npm install                          # also generates the Prisma client
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up -d                 # Postgres 16 on localhost:5433
npm run prisma:migrate -w backend
npm run seed

npm run dev                          # API :4000, app :5173
```

Open http://localhost:5173.

| | |
|---|---|
| Internal workspace | http://localhost:5173/login |
| Customer portal | http://localhost:5173/portal/login |
| API | http://localhost:4000 (`GET /health`) |

### Sign in

Every seeded account uses the password **`dealflow360`**.

| Email | Role | Sees |
|---|---|---|
| `rep@dealflow360.test` | Sales Rep | builds quotes, answers customer negotiations |
| `manager@dealflow360.test` | Sales Manager | the approval desk, deal health |
| `finance@dealflow360.test` | Finance | approvals, subscriptions, invoices, inventory |
| `admin@dealflow360.test` | Admin | everything, plus staff users and discount ceilings |

Customer portal: `aarti@acme.test` (Acme, Gold), `gita@globex.test` (Globex,
Silver), `ishan@initech.test` (Initech, Bronze) — same password.

> Use `npm run seed`, not `npx prisma db seed` — there is no `prisma.seed` key,
> so the latter silently does nothing and leaves you with an empty database.

---

## A five-minute tour

1. **Sign in as the rep.** Open `Q-2026-0001` — the worked example. Each line
   shows its own limit and an `OVER (+8pt)` badge where it breaks one. Change a
   discount and the totals, margin, ceiling and overage all come back
   recalculated. Accept an upsell from the panel and watch the order total move.
2. **Submit it.** No "request approval" button — the engine scores it HIGH and
   raises a Sales Manager → Finance chain by itself.
3. **Sign in as the manager.** The approval detail explains *why* it was flagged,
   line by line, with the step timeline and the audit trail underneath. Approve
   it.
4. **Confirm the order.** The fulfillment detail shows the suggested split with
   quantities, shipment count and cost per warehouse — accept it or override it
   by hand.
5. **Sign in to the portal as the customer.** Ask for a bigger discount on a
   line. The quote moves to Negotiation; if the agreed terms break a ceiling it
   re-enters approval automatically — from the portal *and* when staff accept
   the counter from the quotation. Agreeing on the phone cannot bypass
   governance.
6. **Sign in as finance.** The order's one-time and recurring lines bill
   separately. Record a payment and the invoice closes.
7. **Deal health** (manager) scans for stalled deals, discount anomalies and
   delivery slippage, and lets you escalate or nudge the rep — on the record,
   not by email.
8. **Reports** (manager/finance/admin) filter by period, owner, approval status
   and product, and export to PDF or XLSX.

The notification bell in the header is live throughout: pending approvals, open
alerts and quotes waiting on a reply, each scoped to what your role can act on.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | Node + Express + TypeScript, REST |
| Database | PostgreSQL 16 + Prisma 6 |
| Monorepo | npm workspaces — `shared`, `backend`, `frontend` |
| Tests | Vitest (backend), Playwright for browser verification |

```
shared/     types shared by both sides — a Quotation is declared once
backend/    Express API, Prisma schema, business logic
frontend/   React: the internal workspace and the customer portal
docs/       HANDOFF.md — the working notes for whoever picks this up next
```

A few conventions worth knowing before reading the code:

- every endpoint answers `{ data, error }`; lists add `meta`
- money is `Decimal`, never `Float`; percentages are decimal percent (`12.5` is
  12.5%)
- controllers are thin — they parse, delegate and respond, nothing else
- the customer portal is a **separate surface** with its own middleware, its own
  token and its own secret; portal reads are scoped server-side, never by a
  client-side filter
- approvals, rejections, returns, discount edits, ceiling changes, negotiation
  answers and manual fulfillment overrides all write to `audit_log`
- REST only — there is no socket layer

---

## Tests

```bash
npm test -w backend      # 24 tests
npm run typecheck        # shared + backend + frontend
```

The suite covers the three engines and the negotiation flow:

| File | Covers |
|---|---|
| `discount-engine.test.ts` | the worked example, and a "many small overages" case proving the blended score is not simply max-of-line |
| `fulfillment-split.test.ts` | splitting across two warehouses, backorders, single-warehouse preference, shipment reuse, and not double-promising stock |
| `subscription-proration.test.ts` | upgrades, downgrades, quantity changes, cancellation credits and cycle boundaries |
| `negotiation.test.ts` | answering a counter — priced inside the ceiling, a breach re-entering approval, rejection, and two people answering at once |

UI behaviour is verified by driving the running app with Playwright, asserting
zero console errors alongside the behavioural checks. Frontend unit tests are
deliberately out of scope.

---

## Scope

**Built:** all 18 screens in `specs.md` §6, and the 8-step acceptance flow in §7.

**Deliberately not built:** multi-currency and multi-company (called out as a
bonus, not a requirement), self-service signup and SSO, and a socket layer.
Configuring the approval-chain bands is phase 2 of the discount-tiers screen —
the ceilings are editable today, the bands are shown read-only because they live
inside the pure engine rather than in a table.

`docs/HANDOFF.md` has the full picture: what exists, what does not, why, and
every trap worth knowing before changing something.
