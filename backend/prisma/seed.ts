// DealFlow360 seed — the worked example from specs.md §3 plus the stock levels
// the fulfillment demo needs (one split case, one backorder case).
//
// Idempotent: every run wipes the seeded tables and re-inserts inside a single
// transaction, then replays the discount snapshot over the quotations it wrote,
// so running it twice leaves the same rows and the same numbers.
//
// Risk fields (applicable_ceiling_pct, overage_pct, risk_score_factor,
// quotation.risk_score) are not computed here: the snapshot pass at the end of
// main() hands each seeded quotation to recomputeQuotation, the same function
// the API runs after an edit, so the discount engine remains the only place the
// maths lives.

import 'dotenv/config';
import {
  PrismaClient,
  Prisma,
  BillingCycle,
  FulfillmentStatus,
  LineType,
  QuotationStatus,
  SalesOrderStatus,
  ApprovalLevel,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

import { recomputeQuotation } from '../src/modules/quotations/quotations.service';

const prisma = new PrismaClient();

const D = (value: string | number) => new Prisma.Decimal(value);

// Fixed ids keep re-runs stable and make cross-references readable.
const ID = {
  tierBronze: '11111111-1111-4111-8111-000000000001',
  tierSilver: '11111111-1111-4111-8111-000000000002',
  tierGold: '11111111-1111-4111-8111-000000000003',

  catHardware: '22222222-2222-4222-8222-000000000001',
  catServices: '22222222-2222-4222-8222-000000000002',

  ruleBronze: '33333333-3333-4333-8333-000000000005',
  ruleSilver: '33333333-3333-4333-8333-000000000006',
  ruleGold: '33333333-3333-4333-8333-000000000001',
  ruleHardware: '33333333-3333-4333-8333-000000000002',
  ruleServices: '33333333-3333-4333-8333-000000000003',
  ruleGlobal: '33333333-3333-4333-8333-000000000004',

  prodLaptop: '44444444-4444-4444-8444-000000000001',
  prodSetup: '44444444-4444-4444-8444-000000000002',
  prodWarranty: '44444444-4444-4444-8444-000000000003',
  recLaptopWarranty: '66666666-6666-4666-8666-000000000001',
  recLaptopSupport: '66666666-6666-4666-8666-000000000002',
  variantLaptop: '44444444-4444-4444-8444-000000000101',

  prodSupport: '33333333-3333-4333-8333-000000000004',

  planSupportPlus: '55555555-5555-4555-8555-000000000001',
  planSupportBasic: '55555555-5555-4555-8555-000000000002',
  planSupportPremium: '55555555-5555-4555-8555-000000000003',

  quotationHybrid: 'cccccccc-cccc-4ccc-8ccc-000000000002',
  lineHybridWarranty: 'dddddddd-dddd-4ddd-8ddd-000000000101',
  lineHybridSupport: 'dddddddd-dddd-4ddd-8ddd-000000000102',

  roleSalesRep: '66666666-6666-4666-8666-000000000001',
  roleSalesManager: '66666666-6666-4666-8666-000000000002',
  roleFinance: '66666666-6666-4666-8666-000000000003',
  roleAdmin: '66666666-6666-4666-8666-000000000004',

  userSalesRep: '77777777-7777-4777-8777-000000000001',
  userSalesManager: '77777777-7777-4777-8777-000000000002',
  userFinance: '77777777-7777-4777-8777-000000000003',
  userAdmin: '77777777-7777-4777-8777-000000000004',

  portalRoleBuyer: '88888888-8888-4888-8888-000000000001',
  customerAcme: '88888888-8888-4888-8888-000000000002',
  contactAcme: '88888888-8888-4888-8888-000000000003',

  chainMedium: '99999999-9999-4999-8999-000000000001',
  chainHighManager: '99999999-9999-4999-8999-000000000002',
  chainHighFinance: '99999999-9999-4999-8999-000000000003',

  whMumbai: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  whDelhi: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',

  stockLaptopMumbai: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  stockLaptopDelhi: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
  stockWarrantyMumbai: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003',
  stockWarrantyDelhi: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004',

  quotation: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  lineLaptop: 'cccccccc-cccc-4ccc-8ccc-000000000101',
  lineSetup: 'cccccccc-cccc-4ccc-8ccc-000000000102',
  lineWarranty: 'cccccccc-cccc-4ccc-8ccc-000000000103',

  // --- Deal health fixtures (see DEAL_HEALTH_FIXTURES below) --------------
  customerGlobex: '88888888-8888-4888-8888-000000000004',
  contactGlobex: '88888888-8888-4888-8888-000000000005',
  customerInitech: '88888888-8888-4888-8888-000000000006',
  contactInitech: '88888888-8888-4888-8888-000000000007',

  quotationStalled: 'eeeeeeee-eeee-4eee-8eee-000000000001',
  quotationNormalA: 'eeeeeeee-eeee-4eee-8eee-000000000002',
  quotationNormalB: 'eeeeeeee-eeee-4eee-8eee-000000000003',
  quotationNormalC: 'eeeeeeee-eeee-4eee-8eee-000000000004',
  quotationAnomaly: 'eeeeeeee-eeee-4eee-8eee-000000000005',
  quotationLate: 'eeeeeeee-eeee-4eee-8eee-000000000006',

  salesOrderLate: 'eeeeeeee-eeee-4eee-8eee-000000000011',
  salesOrderLineLate: 'eeeeeeee-eeee-4eee-8eee-000000000012',
  fulfillmentLate: 'eeeeeeee-eeee-4eee-8eee-000000000013',
} as const;

/**
 * What each deal-health fixture is for. POST /alerts/scan on a fresh seed opens
 * exactly three alerts, one per type in specs.md §4:
 *
 *   STALLED_DEAL      Q-2026-0003 (Globex) — last activity backdated 30 days,
 *                     still DRAFT, so it clears the 14-day threshold.
 *   DISCOUNT_ANOMALY  Q-2026-0007 (Initech) — 40% against the same rep's own
 *                     average of roughly 5%, built from Q-2026-0004/5/6 at 8%
 *                     plus the quotes already in the seed.
 *   DELIVERY_SLIPPAGE SO-2026-0001 (Acme) — one reserved shipment whose
 *                     promised date is 10 days in the past and has not shipped.
 */
const DEAL_HEALTH_FIXTURES = {
  /** How far back the stalled quote's last activity is set. */
  stalledIdleDays: 30,
  /** How far in the past the late shipment's promise sits. */
  promiseLateDays: 10,
} as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Per-line money, derived from the list price, quantity and discount above. */
function lineMoney(listPrice: string, unitCost: string, quantity: string, discountPct: string) {
  const unitPrice = D(listPrice);
  const qty = D(quantity);
  const lineSubtotal = unitPrice.mul(qty);
  const lineTotal = lineSubtotal.mul(D(100).minus(D(discountPct))).div(100);
  const cost = D(unitCost).mul(qty);
  const marginAmount = lineTotal.minus(cost);
  const marginPct = lineTotal.isZero() ? D(0) : marginAmount.div(lineTotal).mul(100);

  return {
    quantity: qty,
    unitPrice,
    listPrice: unitPrice,
    unitCost: D(unitCost),
    discountPct: D(discountPct),
    lineSubtotal: lineSubtotal.toDecimalPlaces(2),
    lineTotal: lineTotal.toDecimalPlaces(2),
    marginAmount: marginAmount.toDecimalPlaces(2),
    marginPct: marginPct.toDecimalPlaces(2),
  };
}

const laptopLine = lineMoney('120000', '90000', '10', '12');
const setupLine = lineMoney('20000', '8000', '1', '18');
const warrantyLine = lineMoney('15000', '5000', '2', '10');
const allLines = [laptopLine, setupLine, warrantyLine];

const subtotalAmount = allLines.reduce((sum, l) => sum.plus(l.lineSubtotal), D(0));
const totalAmount = allLines.reduce((sum, l) => sum.plus(l.lineTotal), D(0));
const discountAmount = subtotalAmount.minus(totalAmount);
const marginAmount = allLines.reduce((sum, l) => sum.plus(l.marginAmount), D(0));
const marginPct = totalAmount.isZero() ? D(0) : marginAmount.div(totalAmount).mul(100).toDecimalPlaces(2);

// The hybrid quote's own money, kept apart from the worked example's totals.
const hybridWarrantyLine = lineMoney('15000', '5000', '1', '0');
const hybridSupportLine = lineMoney('5000', '1500', '1', '0');
const hybridSubtotal = hybridWarrantyLine.lineSubtotal.plus(hybridSupportLine.lineSubtotal);
const hybridMargin = hybridWarrantyLine.marginAmount.plus(hybridSupportLine.marginAmount);
const hybridMarginPct = hybridSubtotal.isZero()
  ? D(0)
  : hybridMargin.div(hybridSubtotal).mul(100).toDecimalPlaces(2);

// --- Deal health fixture money -------------------------------------------
// Single-line quotes, so the weighted discount of each is simply its line's.
const stalledLine = lineMoney('120000', '90000', '2', '5');
const normalLine = lineMoney('120000', '90000', '1', '8');
const anomalyLine = lineMoney('120000', '90000', '3', '40');
const lateLine = lineMoney('15000', '5000', '1', '0');

/** One-line quotation totals, derived the same way the worked example's are. */
function singleLineTotals(line: ReturnType<typeof lineMoney>) {
  return {
    subtotalAmount: line.lineSubtotal,
    discountAmount: line.lineSubtotal.minus(line.lineTotal).toDecimalPlaces(2),
    oneTimeTotalAmount: line.lineTotal,
    recurringTotalAmount: D('0.00'),
    totalAmount: line.lineTotal,
    marginAmount: line.marginAmount,
    marginPct: line.marginPct,
  };
}

// Dev-only credential: every seeded internal login and the portal contact share
// the password `dealflow360`. It is hashed here the same way a real one would
// be, so POST /auth/login runs the identical bcrypt comparison.
const SEED_PASSWORD = 'dealflow360';
const PLACEHOLDER_PASSWORD_HASH = bcrypt.hashSync(SEED_PASSWORD, 10);

async function main() {
  await prisma.$transaction(async (tx) => {
    // Wipe in FK-safe order (children first). Order and fulfillment rows are
    // written by the running app (POST /quotations/:id/confirm and the
    // fulfillment module), so a reseed has to clear them too.
    await tx.alert.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.payment.deleteMany();
    await tx.creditNote.deleteMany();
    await tx.invoiceLine.deleteMany();
    await tx.billingSchedule.deleteMany();
    await tx.prorationEvent.deleteMany();
    await tx.invoice.deleteMany();
    await tx.subscription.deleteMany();
    await tx.backorder.deleteMany();
    await tx.fulfillment.deleteMany();
    await tx.fulfillmentSplitSuggestion.deleteMany();
    await tx.salesOrderLine.deleteMany();
    await tx.salesOrder.deleteMany();
    await tx.approvalStep.deleteMany();
    await tx.riskScoreFactor.deleteMany();
    await tx.quotationLine.deleteMany();
    await tx.quotation.deleteMany();
    await tx.inventoryStock.deleteMany();
    await tx.warehouse.deleteMany();
    await tx.subscriptionPlan.deleteMany();
    await tx.productVariant.deleteMany();
    await tx.productRecommendation.deleteMany();
    await tx.product.deleteMany();
    await tx.discountRule.deleteMany();
    await tx.approvalChainRule.deleteMany();
    await tx.customerContact.deleteMany();
    await tx.customer.deleteMany();
    await tx.portalRole.deleteMany();
    await tx.userRole.deleteMany();
    await tx.rolePermission.deleteMany();
    await tx.role.deleteMany();
    await tx.user.deleteMany();
    await tx.category.deleteMany();
    await tx.customerTier.deleteMany();

    // --- Tiers -------------------------------------------------------------
    await tx.customerTier.createMany({
      data: [
        { id: ID.tierBronze, code: 'BRONZE', name: 'Bronze', ceilingPct: D('10.00') },
        { id: ID.tierSilver, code: 'SILVER', name: 'Silver', ceilingPct: D('12.00') },
        { id: ID.tierGold, code: 'GOLD', name: 'Gold', ceilingPct: D('15.00') },
      ],
    });

    // --- Categories --------------------------------------------------------
    await tx.category.createMany({
      data: [
        { id: ID.catHardware, code: 'HARDWARE', name: 'Hardware' },
        { id: ID.catServices, code: 'SERVICES', name: 'Services' },
      ],
    });

    // --- Discount rules (single-axis) --------------------------------------
    await tx.discountRule.createMany({
      data: [
        // Every tier carries its own rule, so a tier's ceiling is the one the
        // engine actually applies. With only Gold ruled, a Bronze or Silver
        // quote fell through to the 5% global backstop while the tier table
        // advertised 10% and 12% — the same number meaning two things.
        { id: ID.ruleBronze, customerTierId: ID.tierBronze, ceilingPct: D('10.00'), description: 'Bronze tier ceiling' },
        { id: ID.ruleSilver, customerTierId: ID.tierSilver, ceilingPct: D('12.00'), description: 'Silver tier ceiling' },
        { id: ID.ruleGold, customerTierId: ID.tierGold, ceilingPct: D('15.00'), description: 'Gold tier ceiling' },
        { id: ID.ruleHardware, categoryId: ID.catHardware, ceilingPct: D('15.00'), description: 'Hardware category ceiling' },
        { id: ID.ruleServices, categoryId: ID.catServices, ceilingPct: D('10.00'), description: 'Services category ceiling' },
        { id: ID.ruleGlobal, ceilingPct: D('5.00'), description: 'Global default backstop' },
      ],
    });

    // --- Roles & users -----------------------------------------------------
    await tx.role.createMany({
      data: [
        { id: ID.roleSalesRep, code: 'SALES_REP', name: 'Sales Rep' },
        { id: ID.roleSalesManager, code: 'SALES_MANAGER', name: 'Sales Manager' },
        { id: ID.roleFinance, code: 'FINANCE', name: 'Finance' },
        { id: ID.roleAdmin, code: 'ADMIN', name: 'Admin' },
      ],
    });

    await tx.user.createMany({
      data: [
        { id: ID.userSalesRep, email: 'rep@dealflow360.test', fullName: 'Riya Sales Rep', passwordHash: PLACEHOLDER_PASSWORD_HASH },
        { id: ID.userSalesManager, email: 'manager@dealflow360.test', fullName: 'Manav Sales Manager', passwordHash: PLACEHOLDER_PASSWORD_HASH },
        { id: ID.userFinance, email: 'finance@dealflow360.test', fullName: 'Farah Finance', passwordHash: PLACEHOLDER_PASSWORD_HASH },
        { id: ID.userAdmin, email: 'admin@dealflow360.test', fullName: 'Anaya Admin', passwordHash: PLACEHOLDER_PASSWORD_HASH },
      ],
    });

    await tx.userRole.createMany({
      data: [
        { userId: ID.userSalesRep, roleId: ID.roleSalesRep },
        { userId: ID.userSalesManager, roleId: ID.roleSalesManager },
        { userId: ID.userFinance, roleId: ID.roleFinance },
        { userId: ID.userAdmin, roleId: ID.roleAdmin },
      ],
    });

    // --- Approval chain ----------------------------------------------------
    // No rule covers scores below 1.00: within limits means auto-approved.
    // Bands are placeholders; the discount engine step tunes the thresholds.
    await tx.approvalChainRule.createMany({
      data: [
        { id: ID.chainMedium, name: 'Medium risk — Sales Manager', minScore: D('1.00'), maxScore: D('15.00'), requiredLevel: ApprovalLevel.SALES_MANAGER, sequence: 1 },
        { id: ID.chainHighManager, name: 'High risk — Sales Manager', minScore: D('15.01'), maxScore: D('100.00'), requiredLevel: ApprovalLevel.SALES_MANAGER, sequence: 1 },
        { id: ID.chainHighFinance, name: 'High risk — Finance', minScore: D('15.01'), maxScore: D('100.00'), requiredLevel: ApprovalLevel.FINANCE, sequence: 2 },
      ],
    });

    // --- Products ----------------------------------------------------------
    await tx.product.createMany({
      data: [
        { id: ID.prodLaptop, sku: 'HW-LAPTOP-PRO-14', name: 'Laptop Pro 14', categoryId: ID.catHardware, listPrice: D('120000.00'), unitCost: D('90000.00') },
        { id: ID.prodSetup, sku: 'SV-ONSITE-SETUP', name: 'Onsite Setup Service', categoryId: ID.catServices, listPrice: D('20000.00'), unitCost: D('8000.00') },
        { id: ID.prodWarranty, sku: 'HW-EXT-WARRANTY', name: 'Extended Warranty', categoryId: ID.catHardware, listPrice: D('15000.00'), unitCost: D('5000.00') },
        // Sold as a recurring line, so it carries no stock and never ships.
        { id: ID.prodSupport, sku: 'SV-SUPPORT-PLUS', name: 'Support Plus', categoryId: ID.catServices, listPrice: D('5000.00'), unitCost: D('1500.00'), isSubscription: true, recurringCycle: BillingCycle.MONTHLY },
      ],
    });

    await tx.productVariant.create({
      data: {
        id: ID.variantLaptop,
        productId: ID.prodLaptop,
        sku: 'HW-LAPTOP-PRO-14-16-512',
        name: '16GB/512GB',
        extraPrice: D('0.00'),
      },
    });

    // --- Recommendations -----------------------------------------------------
    // A laptop pairs with cover and care. margin_delta is the seed's snapshot
    // of (list - cost) × 1 — the endpoint recomputes it live and never reads
    // this column. min_margin_pct 0 means "use the global healthy cutoff".
    await tx.productRecommendation.createMany({
      data: [
        { id: ID.recLaptopWarranty, sourceProductId: ID.prodLaptop, recommendedProductId: ID.prodWarranty, marginDelta: D('10000.00'), minMarginPct: D('0'), promotionTag: 'Frequently paired', rank: 1 },
        { id: ID.recLaptopSupport, sourceProductId: ID.prodLaptop, recommendedProductId: ID.prodSupport, marginDelta: D('3500.00'), minMarginPct: D('0'), promotionTag: null, rank: 2 },
      ],
    });

    // --- Subscription plan -------------------------------------------------
    // Three tiers on one cycle: a subscription can move up or down from
    // Support Plus, so a mid-cycle change has somewhere real to go.
    await tx.subscriptionPlan.createMany({
      data: [
        {
          id: ID.planSupportBasic,
          code: 'SUPPORT_BASIC',
          name: 'Support Basic',
          billingCycle: BillingCycle.MONTHLY,
          recurringPrice: D('3000.00'),
        },
        {
          id: ID.planSupportPlus,
          code: 'SUPPORT_PLUS',
          name: 'Support Plus',
          productId: ID.prodSupport,
          billingCycle: BillingCycle.MONTHLY,
          recurringPrice: D('5000.00'),
        },
        {
          id: ID.planSupportPremium,
          code: 'SUPPORT_PREMIUM',
          name: 'Support Premium',
          billingCycle: BillingCycle.MONTHLY,
          recurringPrice: D('8000.00'),
        },
      ],
    });

    // --- Customer & portal contact -----------------------------------------
    await tx.portalRole.create({
      data: {
        id: ID.portalRoleBuyer,
        code: 'PORTAL_BUYER',
        name: 'Portal Buyer',
        permissions: ['quotation:view', 'quotation:negotiate', 'invoice:view'],
      },
    });

    await tx.customer.create({
      data: {
        id: ID.customerAcme,
        code: 'ACME',
        name: 'Acme Corp',
        customerTierId: ID.tierGold,
        accountOwnerUserId: ID.userSalesRep,
        email: 'ap@acme.test',
      },
    });

    await tx.customerContact.create({
      data: {
        id: ID.contactAcme,
        customerId: ID.customerAcme,
        fullName: 'Aarti Buyer',
        email: 'aarti@acme.test',
        isPrimary: true,
        portalRoleId: ID.portalRoleBuyer,
        portalPasswordHash: PLACEHOLDER_PASSWORD_HASH,
        portalTokenVersion: 0,
      },
    });

    // Two more customers, so the book, the pickers and the deal-health board
    // have more than one name in them.
    await tx.customer.createMany({
      data: [
        {
          id: ID.customerGlobex,
          code: 'GLOBEX',
          name: 'Globex Industries',
          customerTierId: ID.tierSilver,
          accountOwnerUserId: ID.userSalesRep,
          email: 'ap@globex.test',
          billingAddress: 'Andheri East, Mumbai 400069',
        },
        {
          id: ID.customerInitech,
          code: 'INITECH',
          name: 'Initech',
          customerTierId: ID.tierBronze,
          accountOwnerUserId: ID.userSalesRep,
          email: 'ap@initech.test',
          billingAddress: 'Hinjewadi Phase 2, Pune 411057',
        },
      ],
    });

    await tx.customerContact.createMany({
      data: [
        {
          id: ID.contactGlobex,
          customerId: ID.customerGlobex,
          fullName: 'Gita Rao',
          email: 'gita@globex.test',
          isPrimary: true,
          portalRoleId: ID.portalRoleBuyer,
          portalPasswordHash: PLACEHOLDER_PASSWORD_HASH,
          portalTokenVersion: 0,
        },
        {
          id: ID.contactInitech,
          customerId: ID.customerInitech,
          fullName: 'Ishan Mehta',
          email: 'ishan@initech.test',
          isPrimary: true,
          portalRoleId: ID.portalRoleBuyer,
          portalPasswordHash: PLACEHOLDER_PASSWORD_HASH,
          portalTokenVersion: 0,
        },
      ],
    });

    // --- Warehouses & stock -------------------------------------------------
    await tx.warehouse.createMany({
      data: [
        { id: ID.whMumbai, code: 'WH-MUMBAI', name: 'WH-Mumbai', shippingCostWeight: D('1.00'), priority: 1 },
        { id: ID.whDelhi, code: 'WH-DELHI', name: 'WH-Delhi', shippingCostWeight: D('1.50'), priority: 2 },
      ],
    });

    // Laptop stock sits on the variant (6 + 5 = 11): an order of 10 cannot be
    // filled by either warehouse alone, so it triggers a split and leaves stock.
    // Extended Warranty has no variant and only 3 units, so a larger order
    // becomes a backorder case.
    await tx.inventoryStock.createMany({
      data: [
        { id: ID.stockLaptopMumbai, warehouseId: ID.whMumbai, productId: ID.prodLaptop, productVariantId: ID.variantLaptop, onHand: D('6.00'), reserved: D('0.00'), available: D('6.00') },
        { id: ID.stockLaptopDelhi, warehouseId: ID.whDelhi, productId: ID.prodLaptop, productVariantId: ID.variantLaptop, onHand: D('5.00'), reserved: D('0.00'), available: D('5.00') },
        // One warranty unit is reserved for the late shipment fixture below,
        // so the stock row and that shipment agree.
        { id: ID.stockWarrantyMumbai, warehouseId: ID.whMumbai, productId: ID.prodWarranty, onHand: D('3.00'), reserved: D('1.00'), available: D('2.00') },
        { id: ID.stockWarrantyDelhi, warehouseId: ID.whDelhi, productId: ID.prodWarranty, onHand: D('0.00'), reserved: D('0.00'), available: D('0.00') },
      ],
    });

    // --- Quotation (specs.md §3 worked example) -----------------------------
    await tx.quotation.create({
      data: {
        id: ID.quotation,
        number: 'Q-2026-0001',
        customerId: ID.customerAcme,
        customerContactId: ID.contactAcme,
        ownerUserId: ID.userSalesRep,
        status: QuotationStatus.DRAFT,
        subtotalAmount: subtotalAmount.toDecimalPlaces(2),
        discountAmount: discountAmount.toDecimalPlaces(2),
        oneTimeTotalAmount: totalAmount.toDecimalPlaces(2),
        totalAmount: totalAmount.toDecimalPlaces(2),
        marginAmount: marginAmount.toDecimalPlaces(2),
        marginPct,
        notes: 'Seeded worked example from specs.md §3.',
      },
    });

    await tx.quotationLine.createMany({
      data: [
        {
          id: ID.lineLaptop,
          quotationId: ID.quotation,
          productId: ID.prodLaptop,
          productVariantId: ID.variantLaptop,
          categoryId: ID.catHardware,
          lineType: LineType.ONE_TIME,
          sequence: 1,
          description: 'Laptop Pro 14 — 16GB/512GB',
          ...laptopLine,
        },
        {
          id: ID.lineSetup,
          quotationId: ID.quotation,
          productId: ID.prodSetup,
          categoryId: ID.catServices,
          lineType: LineType.ONE_TIME,
          sequence: 2,
          description: 'Onsite Setup Service',
          ...setupLine,
        },
        {
          id: ID.lineWarranty,
          quotationId: ID.quotation,
          productId: ID.prodWarranty,
          categoryId: ID.catHardware,
          lineType: LineType.ONE_TIME,
          sequence: 3,
          description: 'Extended Warranty',
          ...warrantyLine,
        },
      ],
    });

    // --- Hybrid quotation (specs.md §4 hybrid billing) ----------------------
    //
    // The worked example above is the risk fixture and stays exactly as specs.md
    // states it. Hybrid billing needs a second quote: one one-time line that
    // ships and bills against the shipment, and one recurring line that becomes
    // a subscription on confirm and bills on its own cycle. Both are at list
    // price, so this quote carries no discount risk and does not disturb the
    // fixture.
    await tx.quotation.create({
      data: {
        id: ID.quotationHybrid,
        number: 'Q-2026-0002',
        customerId: ID.customerAcme,
        customerContactId: ID.contactAcme,
        ownerUserId: ID.userSalesRep,
        status: QuotationStatus.DRAFT,
        subtotalAmount: hybridSubtotal.toDecimalPlaces(2),
        discountAmount: D('0.00'),
        oneTimeTotalAmount: hybridWarrantyLine.lineTotal,
        recurringTotalAmount: hybridSupportLine.lineTotal,
        totalAmount: hybridSubtotal.toDecimalPlaces(2),
        marginAmount: hybridMargin.toDecimalPlaces(2),
        marginPct: hybridMarginPct,
        notes: 'Hybrid order: one-time hardware plus a monthly subscription.',
      },
    });

    await tx.quotationLine.createMany({
      data: [
        {
          id: ID.lineHybridWarranty,
          quotationId: ID.quotationHybrid,
          productId: ID.prodWarranty,
          categoryId: ID.catHardware,
          lineType: LineType.ONE_TIME,
          sequence: 1,
          description: 'Extended Warranty',
          ...hybridWarrantyLine,
        },
        {
          id: ID.lineHybridSupport,
          quotationId: ID.quotationHybrid,
          productId: ID.prodSupport,
          categoryId: ID.catServices,
          lineType: LineType.RECURRING,
          subscriptionPlanId: ID.planSupportPlus,
          sequence: 2,
          description: 'Support Plus — monthly',
          ...hybridSupportLine,
        },
      ],
    });

    // --- Deal health fixtures ----------------------------------------------
    // Three quotations and one order, shaped so that a scan on a fresh seed
    // opens exactly one alert of each type. See DEAL_HEALTH_FIXTURES above.

    // STALLED_DEAL: idle far past the 14-day threshold, still a live draft.
    await tx.quotation.create({
      data: {
        id: ID.quotationStalled,
        number: 'Q-2026-0003',
        customerId: ID.customerGlobex,
        customerContactId: ID.contactGlobex,
        ownerUserId: ID.userSalesRep,
        status: QuotationStatus.DRAFT,
        ...singleLineTotals(stalledLine),
        notes: 'Waiting on Globex to come back with headcount.',
        lastActivityAt: daysAgo(DEAL_HEALTH_FIXTURES.stalledIdleDays),
        createdAt: daysAgo(DEAL_HEALTH_FIXTURES.stalledIdleDays),
      },
    });

    await tx.quotationLine.create({
      data: {
        quotationId: ID.quotationStalled,
        productId: ID.prodLaptop,
        productVariantId: ID.variantLaptop,
        categoryId: ID.catHardware,
        lineType: LineType.ONE_TIME,
        sequence: 1,
        description: 'Laptop Pro 14 — 16GB/512GB',
        ...stalledLine,
      },
    });

    // DISCOUNT_ANOMALY: three ordinary quotes give the rep an average to be
    // measured against, and the fourth is the outlier the detector must find.
    const anomalyHistory = [
      { id: ID.quotationNormalA, number: 'Q-2026-0004' },
      { id: ID.quotationNormalB, number: 'Q-2026-0005' },
      { id: ID.quotationNormalC, number: 'Q-2026-0006' },
    ];

    for (const [index, quote] of anomalyHistory.entries()) {
      await tx.quotation.create({
        data: {
          id: quote.id,
          number: quote.number,
          customerId: ID.customerInitech,
          customerContactId: ID.contactInitech,
          ownerUserId: ID.userSalesRep,
          status: QuotationStatus.DRAFT,
          ...singleLineTotals(normalLine),
          notes: 'Routine replacement order.',
        },
      });

      await tx.quotationLine.create({
        data: {
          quotationId: quote.id,
          productId: ID.prodLaptop,
          productVariantId: ID.variantLaptop,
          categoryId: ID.catHardware,
          lineType: LineType.ONE_TIME,
          sequence: index + 1,
          description: 'Laptop Pro 14 — 16GB/512GB',
          ...normalLine,
        },
      });
    }

    await tx.quotation.create({
      data: {
        id: ID.quotationAnomaly,
        number: 'Q-2026-0007',
        customerId: ID.customerInitech,
        customerContactId: ID.contactInitech,
        ownerUserId: ID.userSalesRep,
        status: QuotationStatus.DRAFT,
        ...singleLineTotals(anomalyLine),
        notes: 'Aggressive pricing to win the refresh.',
      },
    });

    await tx.quotationLine.create({
      data: {
        quotationId: ID.quotationAnomaly,
        productId: ID.prodLaptop,
        productVariantId: ID.variantLaptop,
        categoryId: ID.catHardware,
        lineType: LineType.ONE_TIME,
        sequence: 1,
        description: 'Laptop Pro 14 — 16GB/512GB',
        ...anomalyLine,
      },
    });

    // DELIVERY_SLIPPAGE: a confirmed order whose reserved shipment was promised
    // ten days ago and has not left the warehouse.
    await tx.quotation.create({
      data: {
        id: ID.quotationLate,
        number: 'Q-2026-0008',
        customerId: ID.customerAcme,
        customerContactId: ID.contactAcme,
        ownerUserId: ID.userSalesRep,
        status: QuotationStatus.CONFIRMED,
        ...singleLineTotals(lateLine),
        notes: 'Warranty top-up, confirmed and awaiting dispatch.',
        submittedAt: daysAgo(20),
        approvedAt: daysAgo(19),
        confirmedAt: daysAgo(18),
      },
    });

    await tx.quotationLine.create({
      data: {
        quotationId: ID.quotationLate,
        productId: ID.prodWarranty,
        categoryId: ID.catHardware,
        lineType: LineType.ONE_TIME,
        sequence: 1,
        description: 'Extended Warranty',
        ...lateLine,
      },
    });

    await tx.salesOrder.create({
      data: {
        id: ID.salesOrderLate,
        number: 'SO-2026-0001',
        quotationId: ID.quotationLate,
        customerId: ID.customerAcme,
        status: SalesOrderStatus.CONFIRMED,
        orderDate: daysAgo(18),
        oneTimeTotalAmount: lateLine.lineTotal,
        recurringTotalAmount: D('0.00'),
        totalAmount: lateLine.lineTotal,
        confirmedByUserId: ID.userSalesRep,
      },
    });

    await tx.salesOrderLine.create({
      data: {
        id: ID.salesOrderLineLate,
        salesOrderId: ID.salesOrderLate,
        productId: ID.prodWarranty,
        lineType: LineType.ONE_TIME,
        sequence: 1,
        quantity: lateLine.quantity,
        quantityFulfilled: D('0.00'),
        unitPrice: lateLine.unitPrice,
        discountPct: lateLine.discountPct,
        lineTotal: lateLine.lineTotal,
      },
    });

    await tx.fulfillment.create({
      data: {
        id: ID.fulfillmentLate,
        salesOrderId: ID.salesOrderLate,
        warehouseId: ID.whMumbai,
        status: FulfillmentStatus.RESERVED,
        shippingCost: D('1.00'),
        // The same shape the fulfillment module writes, so /ship can carry it.
        lines: [
          {
            salesOrderLineId: ID.salesOrderLineLate,
            productId: ID.prodWarranty,
            productVariantId: null,
            quantity: '1',
          },
        ],
        promisedDate: daysAgo(DEAL_HEALTH_FIXTURES.promiseLateDays),
      },
    });
  });

  // --- Discount snapshot ---------------------------------------------------
  //
  // Every row above is written straight into the tables, so nothing has run the
  // discount engine over these quotations: each line would carry a zero ceiling
  // and a zero overage, and the reporting screen would report no over-limit
  // lines at all while the data plainly holds some — Q-2026-0001's Services
  // line is discounted 18% against a 10% ceiling.
  //
  // This replays recomputeQuotation, the same function the API runs after every
  // edit, so the snapshot is the application's own and the maths is not written
  // a second time here (CLAUDE.md rule 1). It fills the per-line ceiling and
  // overage, the blended score and risk level, the approval flag and the frozen
  // risk_score_factor rows — and nothing else. No status is touched, so a
  // seeded draft stays a draft, and no approval step is raised: a quote still
  // has to be submitted for that.
  //
  // It runs after the seed transaction rather than inside it. The wipe and the
  // inserts already fill that transaction, and Prisma's interactive
  // transactions time out at five seconds.
  const snapshotQuotationIds = [
    ID.quotation,
    ID.quotationHybrid,
    ID.quotationStalled,
    ID.quotationNormalA,
    ID.quotationNormalB,
    ID.quotationNormalC,
    ID.quotationAnomaly,
    ID.quotationLate,
  ];

  for (const quotationId of snapshotQuotationIds) {
    const before = await prisma.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      select: { lastActivityAt: true },
    });

    await prisma.$transaction((tx) => recomputeQuotation(tx, quotationId));

    // recomputeQuotation stamps lastActivityAt, as an edit should. Here that
    // would un-stall the deal-health fixture that is deliberately 30 days
    // idle, so each quotation keeps the activity date the seed gave it.
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { lastActivityAt: before.lastActivityAt },
    });
  }

  const counts = {
    customerTier: await prisma.customerTier.count(),
    category: await prisma.category.count(),
    discountRule: await prisma.discountRule.count(),
    role: await prisma.role.count(),
    user: await prisma.user.count(),
    userRole: await prisma.userRole.count(),
    approvalChainRule: await prisma.approvalChainRule.count(),
    product: await prisma.product.count(),
    productVariant: await prisma.productVariant.count(),
    subscriptionPlan: await prisma.subscriptionPlan.count(),
    portalRole: await prisma.portalRole.count(),
    customer: await prisma.customer.count(),
    customerContact: await prisma.customerContact.count(),
    warehouse: await prisma.warehouse.count(),
    inventoryStock: await prisma.inventoryStock.count(),
    quotation: await prisma.quotation.count(),
    quotationLine: await prisma.quotationLine.count(),
    salesOrder: await prisma.salesOrder.count(),
    fulfillment: await prisma.fulfillment.count(),
    riskScoreFactor: await prisma.riskScoreFactor.count(),
    // Proof the snapshot pass actually ran: a seed with none of these has
    // silently gone back to reporting zero over-limit lines.
    linesOverCeiling: await prisma.quotationLine.count({ where: { overagePct: { gt: 0 } } }),
  };

  console.log('Seed complete. Row counts:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
