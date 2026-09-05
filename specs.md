# specs.md — DealFlow360

Product specification, data model, and business rules.
For coding conventions and repo rules, see `CLAUDE.md`.

---

## 1. Problem statement

Most sales tools handle the happy path: create a quote, confirm an order, invoice it. Real B2B sales
teams operate in messier conditions — multi-level discount approvals, partial stock spread across
warehouses, bundled subscriptions mixed with one-time hardware, customers who want to negotiate
inside a portal instead of over email, and managers who only learn a deal is stuck after it has lost
momentum.

DealFlow360 is a self-governing deal engine: it enforces pricing discipline, reacts to inventory in
real time, keeps subscriptions and one-time sales reconciled on a single order, and gives reps and
customers a living, negotiable document instead of a static PDF.

---

## 2. User roles

| Role | Can do |
|---|---|
| **Sales Rep** | Build quotations, apply discounts, add upsells, track approval + fulfillment, respond to negotiation requests |
| **Sales Manager** | Approve/reject/return quotes over threshold, configure discount tiers and approval chains, monitor deal health |
| **Finance / Ops** | Second-level approval for high-risk discounts, manage warehouse splits and backorders, reconcile recurring billing and credit notes |
| **Customer (Portal)** | View quotation, comment per line, counter a discount, confirm final terms |
| **Admin** | Manage products, price lists, discount tiers, warehouses, subscription plans; view platform analytics |

---

## 3. Blended discount risk score — the core algorithm

This is the most important piece of logic in the system. It decides whether a quotation needs
manager approval, and if so whether it also needs finance approval.

### The rule

Different product categories allow different discount ceilings. The system checks **every line
against its own limit**, not one overall limit for the whole order.

### Worked example (use this as the seed + test fixture)

Customer tier: **Gold** (tier ceiling 15%)
Category ceilings: **Hardware 15%**, **Services 10%**

| Line | Category | Discount given | Limit allowed | Result |
|---|---|---|---|---|
| Laptop Pro 14 | Hardware | 12% | 15% | OK — 0 pt over |
| Onsite Setup Service | Services | 18% | 10% | **8 pt OVER** |
| Extended Warranty | Hardware | 10% | 15% | OK — 0 pt over |

Even though the customer is Gold and 15% "sounds fine," the Services line broke its own stricter
limit. The whole quotation is flagged for approval because of that one line.

### Why "blended"

Sometimes no single line is badly over, but many lines are each slightly over — one 2 pt, another
3 pt, another 2 pt. None looks alarming alone, but together the rep has quietly given away
significant margin. The blended score looks at the **total pattern across the order**, not just the
single worst line, so small violations spread across many lines cannot slip through.

### Computation

For each line:
```
applicable_ceiling = min(tier_ceiling, category_ceiling)
overage_pct        = max(0, discount_given_pct - applicable_ceiling)
```

Then across the quotation:
```
max_single_overage = max(overage_pct across lines)
total_overage      = sum(overage_pct across lines)
blended_score      = weighted combination of max_single_overage and total_overage
```

The weighting must ensure **both** of these route to approval:
- one line badly over (the worked example above)
- several lines each slightly over, none individually alarming

Store per-line factors in `risk_score_factor` and the aggregate in `quotation.risk_score`.

### Routing

`approval_chain_rule` maps a blended score range to a required chain:

| Blended risk | Required approval |
|---|---|
| Within tier/category limits | No approval needed — auto-approved |
| Over limit, medium risk | Sales Manager |
| Over limit, high risk | Sales Manager, then Finance |

When a quote mixes categories with different ceilings, compute the blended score and route to the
**highest required level**. All approvals, rejections, and edits are logged with user, timestamp,
and reason.

---

## 4. Other business rules

**Upsell / cross-sell.** While building a quote, a ranked suggestion panel shows suggested product,
margin delta, and promotion tag. Suggestions are filtered by a minimum margin threshold so only
healthy-margin items surface. Accepting a suggestion updates order total and margin immediately.
Store the originating suggestion on the line (`source_recommendation_id`) so it is traceable.

**Warehouse splitting.** On approval, the system suggests a split across warehouses based on live
stock, minimizing shipment count using each warehouse's `shipping_cost_weight`. The user can accept
the suggested split or manually override (`is_manual_override`). If stock arrives mid-fulfillment,
a "Consolidate Remaining Backorder" prompt appears automatically.

**Hybrid billing.** A single order can mix one-time lines and recurring subscription lines
(`quotation_line.line_type`). One-time and recurring lines are shown and billed separately, with
their own billing schedules. Mid-cycle quantity or plan changes generate a `proration_event`.
Cancellation triggers a partial refund or credit note where applicable.

**Portal negotiation.** The customer views the quote, comments per line, and can propose a counter
discount. On confirm: if final terms exceed approval thresholds, the quotation **automatically
re-enters the approval flow**; otherwise it moves straight to fulfillment.

**Deal health.** Three alert types: stalled deals (idle more than a configured number of days),
discount anomalies (a discount well above that rep's historical average), and delivery promise
slippage. Clicking an alert opens the related quotation. Nudge and escalate actions fire from here.

**Billing reconciliation.** Partial invoicing must stay reconciled with partial delivery — nothing
is billed before it ships.

---

## 5. Data model

41 tables. Grouped by concern:

**Configuration**
`customer_tier`, `category`, `product`, `product_variant`, `price_list`, `price_list_item`,
`discount_rule`, `approval_chain_rule`, `subscription_plan`, `product_recommendation`, `report_view`

**Identity & access**
`user`, `customer`, `customer_contact`, `role`, `user_role`, `role_permission`, `portal_role`

**Quoting & approval**
`quotation`, `quotation_line`, `risk_score_factor`, `approval_step`, `negotiation_request`

**Orders & fulfillment**
`sales_order`, `sales_order_line`, `warehouse`, `inventory_stock`,
`fulfillment_split_suggestion`, `fulfillment`, `backorder`

**Subscriptions & billing**
`subscription`, `proration_event`, `billing_schedule`, `invoice`, `invoice_line`,
`payment`, `credit_note`

**Monitoring & integration**
`alert`, `audit_log`, `erp_integration`, `payment_gateway_transaction`

Key relationships to preserve:
- `quotation` → `quotation_line` → `risk_score_factor` (per-line overage feeding blended score)
- `quotation` → `sales_order` (traceability from quote to order)
- `discount_rule` keyed by (tier, category) → ceiling; `approval_chain_rule` keyed by score range → chain
- `quotation_line.line_type` distinguishes one-time from recurring; recurring links to `subscription_plan`
- `warehouse.shipping_cost_weight` feeds the split optimizer

---

## 6. Screens

Every module has one **list** screen (all records) and one **detail** screen (one record, opened by
clicking a row). The highlighted nav tab shows the current module.

**Internal nav:** Dashboard · Quotations · Approvals · Fulfillment · Subscriptions · Invoices · Deal Health · Reports · Products

| # | Screen | Notes |
|---|---|---|
| 1 | Login / Signup | Internal users land on Sales Dashboard; customers land on portal |
| 2 | Sales Dashboard | Pending approvals, open quotations, at-risk deals, recent activity |
| 3 | Quotations (List) | Grouped by stage: Draft, Pending Approval, Approved, Negotiation, Confirmed |
| 4 | Quotation Detail | Line table with Qty / Price / Discount / **Limit** / Status (`OVER (+8pt)` badge), upsell panel, Save Draft, Submit for Approval. **Discount is checked against each line's own limit live as it is typed, not only at submit.** |
| 5 | Approvals (List) | Counts (Pending / Returned / Approved), blended risk badge, stage, assignee |
| 6 | Approval Detail | "Why This Quote Was Flagged" per-line breakdown, approval step timeline, audit trail, Approve / Return for Revision / Reject |
| 7 | Fulfillment (List) | Live stock per warehouse (In Stock / Reserved / Available) + orders awaiting fulfillment |
| 8 | Fulfillment Detail | Suggested split with qty, est. shipments and cost per warehouse; Accept Suggested Split / Manual Override; backorder consolidation prompt |
| 9 | Subscriptions (List) | All recurring plans across customers; Active / Paused / Cancelled counts |
| 10 | Billing Detail | One-time lines and recurring lines shown separately; Modify / Cancel Subscription |
| 11 | **Customer Portal** | Separate nav (My Quotation · Messages · Profile). Per-line comments, counter discount %, requested delivery date, Submit Request / Confirm Quotation |
| 12 | Invoices (List) | Unpaid / Paid counts, amount, due date |
| 13 | Invoice Detail | Progress timeline (Order Confirmed → Shipped → Invoiced → Paid), one-time and recurring invoices, Record Payment |
| 14 | Deal Health Dashboard | Stalled deals, discount anomalies, delivery slippage; Escalate / Nudge Rep |
| 15 | Admin / Reporting | Filters: Period, Sales Team, Approval Status, Product. Export PDF / XLS |
| 16 | Product Catalog | All products, variants, price lists |
| 17 | Product Detail | General info, subscription toggle + recurring cycle, variants with extra price, tier/currency price lists |
| 18 | Discount Tiers & Approval Chains | Tier ceilings, category ceilings, discount-range → approval-chain mapping |

---

## 7. Acceptance test flow

The demo must pass these eight steps in order. Each step must produce a visible, correct result.

1. Sign up / log in, and set up backend data: a discount tier, a warehouse, a subscription plan
2. Create a quotation and add a line with a discount **higher than allowed**
3. Confirm the quote **automatically** requests manager approval — the rep never clicks "request approval"
4. While building, accept one upsell suggestion and confirm order total and margin update **immediately**
5. Get the quote approved, then confirm stock pulls from the correct warehouse, splitting across two if needed
6. Confirm a one-time product and a recurring subscription on the same order are billed correctly and separately
7. Open the customer portal, request a bigger discount as the customer, confirm the quote **automatically** re-enters approval
8. Confirm the order, record a payment, confirm the invoice status updates correctly

---

## 8. Scope boundaries

**In scope:** everything above.

**Explicitly out of scope:** multi-currency and multi-company support (bonus, not a requirement).
Frontend unit tests. Production deployment, CI/CD, containerized app services.

**Deliverables (graded):**
- Working application (backend + frontend) with sample seed data
- Five-minute live demo covering at least two full flows end to end
- One-page architecture diagram showing the data model and how modules connect → `docs/`
- Short note on what the team would build next with more time → `docs/next-steps.md`
