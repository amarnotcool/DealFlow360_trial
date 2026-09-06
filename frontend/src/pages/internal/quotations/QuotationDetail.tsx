// Screen 4 (specs.md §6): one quotation, its lines, and the live discount check.
//
// The ceiling and the overage on every line come from the API — the engine owns
// that maths. Editing a discount PATCHes the line and re-renders from whatever
// the server sends back; nothing is computed here.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  ProductListItem,
  QuotationDetailView,
  QuotationLineView,
  SalesOrderConfirmationView,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import NegotiationPanel from './components/NegotiationPanel';
import UpsellPanel from './components/UpsellPanel';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  ErrorCard,
  LoadingCard,
  RiskBadge,
  RowMenuButton,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchProducts } from '../../../features/products/products.api';
import {
  addQuotationLine,
  confirmQuotation,
  deleteQuotationLine,
  fetchQuotation,
  submitQuotation,
  updateQuotationLine,
} from '../../../features/quotations/quotations.api';
import { humanise, money, percent, points } from '../../../lib/format';

/** What submit did, shown as the visible proof of automatic routing. */
interface RoutingNotice {
  autoApproved: boolean;
  chain: string[];
}

/** Live per-line engine result, keyed by line id. */
type LineRisk = { applicableCeilingPct: number; overagePct: number };

const PICKER_CLASS =
  'frost-input h-10 max-w-full rounded-full px-md text-body-sm text-ink-body ' +
  'focus:outline-none focus:ring-2 focus:ring-lemon/60 disabled:opacity-50';

function LineStatus({ overagePct }: { overagePct: number }) {
  if (overagePct > 0) {
    return <Badge variant="critical">OVER (+{points(overagePct)}pt)</Badge>;
  }
  return <span className="text-body-sm text-ink-subtle">Within limit</span>;
}

export default function QuotationDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState<QuotationDetailView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [recalculatingLineId, setRecalculatingLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [routing, setRouting] = useState<RoutingNotice | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [newLineProductId, setNewLineProductId] = useState('');
  const [newLineVariantId, setNewLineVariantId] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('1');
  const [confirmation, setConfirmation] = useState<SalesOrderConfirmationView | null>(null);

  const load = useCallback(async () => {
    const response = await fetchQuotation(id);
    setQuotation(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The picker only offers products that can still be sold; a deactivated one
  // stays on the quotes that already carry it but cannot be added to a new line.
  useEffect(() => {
    void fetchProducts().then((response) => setProducts(response.data ?? []));
  }, []);

  /** Live discount check: commit on blur, then re-render from the server. */
  async function commitDiscount(line: QuotationLineView, raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next > 100 || next === Number(line.discountPct)) {
      return;
    }

    setRecalculatingLineId(line.id);
    const response = await updateQuotationLine(id, line.id, {
      discountPct: next,
    });
    setRecalculatingLineId(null);

    if (response.data) {
      setQuotation(response.data);
      setRouting(null);
      return;
    }
    setError(response.error);
  }

  /** Adds the chosen product — and its variant, when it has one — at no
      discount; the engine re-scores the quote and the server sends it back. */
  async function handleAddLine() {
    const quantity = Number(newLineQuantity);
    if (!newLineProductId || !Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    setBusy(true);
    const response = await addQuotationLine(id, {
      productId: newLineProductId,
      productVariantId: newLineVariantId || null,
      quantity,
      discountPct: 0,
    });
    setBusy(false);

    if (response.data) {
      setQuotation(response.data);
      setNewLineProductId('');
      setNewLineVariantId('');
      setNewLineQuantity('1');
      return;
    }
    setError(response.error);
  }

  async function handleDeleteLine(lineId: string) {
    setBusy(true);
    const response = await deleteQuotationLine(id, lineId);
    setBusy(false);

    if (response.data) {
      setQuotation(response.data);
      return;
    }
    setError(response.error);
  }

  async function handleSubmit() {
    setBusy(true);
    const response = await submitQuotation(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setQuotation(response.data);
    setRouting({
      autoApproved: response.data.approvalSteps.length === 0,
      chain: response.data.approvalSteps
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((step) => humanise(step.level)),
    });
  }

  /** Approve → confirm → fulfill: confirming turns the quote into a sales order. */
  async function handleConfirm() {
    setBusy(true);
    const response = await confirmQuotation(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setConfirmation(response.data);
    setError(null);
    await load();
  }

  if (error && !quotation) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Quotations']} title="Quotation">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!quotation) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Quotations']} title="Quotation">
        <LoadingCard label="Quotation" />
      </InternalLayout>
    );
  }

  const isDraft = quotation.status === 'DRAFT';
  const selectedProduct = products.find((product) => product.id === newLineProductId) ?? null;
  const isApproved = quotation.status === 'APPROVED';

  // The engine's live result wins over the stored columns: a draft that has
  // never been submitted still shows the correct ceiling and overage.
  const lineRisk = new Map<string, LineRisk>(
    quotation.risk.lines.map((line) => [
      line.lineId,
      { applicableCeilingPct: line.applicableCeilingPct, overagePct: line.overagePct },
    ]),
  );

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Quotations', quotation.number]}
      title={`${quotation.number} — ${quotation.customer.name}`}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              void load();
              setSavedAt(new Date().toLocaleTimeString());
            }}
          >
            Save Draft
          </Button>
          {isApproved ? (
            <Button onClick={handleConfirm} disabled={busy}>
              {busy ? 'Working…' : 'Confirm Order'}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!isDraft || busy}>
              {busy ? 'Working…' : 'Submit for Approval'}
            </Button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {routing && (
        <Card tone={routing.autoApproved ? 'lemon' : 'obsidian'} className="mb-lg">
          <CardLabel>{routing.autoApproved ? 'Auto-approved on submit' : 'Submitted'}</CardLabel>
          <p className="mt-xs text-title-md">
            {routing.autoApproved
              ? 'Every line is inside its discount ceiling — no approval was needed.'
              : `Automatically routed to: ${routing.chain.join(' → ')}`}
          </p>
          <p className="mt-xs text-body-sm opacity-70">
            The rep never requested approval; the blended score decided the chain.
          </p>
        </Card>
      )}

      {confirmation && (
        <Card tone="lemon" className="mb-lg">
          <CardLabel>Order confirmed</CardLabel>
          <p className="mt-xs text-title-md">
            {`Order confirmed — ${confirmation.number} created`}
          </p>
          <p className="mt-xs text-body-sm opacity-70">
            {confirmation.lines.length} lines · {money(confirmation.totalAmount)}. Stock is allocated on
            the fulfillment screen.
          </p>
          <Button
            variant="obsidian"
            className="mt-md"
            onClick={() => navigate(`/fulfillment/${confirmation.id}`)}
          >
            Open fulfillment
          </Button>
        </Card>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
        <Card tone={quotation.risk.blendedScore > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Blended risk score</CardLabel>
          <CardMetric>{quotation.risk.blendedScore.toFixed(2)}</CardMetric>
          <div className="mt-xs flex items-center gap-xs">
            <RiskBadge level={quotation.risk.riskLevel} />
            <span className="text-body-sm opacity-80">
              max {percent(quotation.risk.maxSingleOverage)} · total {percent(quotation.risk.totalOverage)}
            </span>
          </div>
        </Card>

        <Card>
          <CardLabel>Order total</CardLabel>
          <CardMetric>{money(quotation.totalAmount)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            Subtotal {money(quotation.subtotalAmount)} · discount {money(quotation.discountAmount)}
          </p>
        </Card>

        <Card>
          <CardLabel>Margin</CardLabel>
          <CardMetric>{percent(quotation.marginPct)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">{money(quotation.marginAmount)}</p>
        </Card>

        <Card tone="obsidian">
          <CardLabel>Stage</CardLabel>
          <p className="mt-xs text-headline-lg">{humanise(quotation.status)}</p>
          <p className="text-body-sm text-obsidian-muted">
            {quotation.customer.customerTier?.name ?? 'No tier'} · owner {quotation.ownerUser.fullName}
          </p>
          {savedAt && <p className="mt-xs text-label-md text-obsidian-muted">Refreshed {savedAt}</p>}
        </Card>
      </div>

      <TableShell>
        <TableToolbar>
          <div className="flex items-center gap-sm">
            <h2 className="text-title-md text-ink">Lines</h2>
            <Badge variant="neutral">{quotation.lines.length} lines</Badge>
            {recalculatingLineId && <Badge variant="primary">Recalculating…</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-sm">
            <select
              value={newLineProductId}
              onChange={(event) => {
                setNewLineProductId(event.target.value);
                setNewLineVariantId('');
              }}
              aria-label="Product to add"
              disabled={!isDraft}
              className={PICKER_CLASS}
            >
              <option value="">Choose a product…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.sku} · {money(product.listPrice)}
                </option>
              ))}
            </select>

            {selectedProduct && selectedProduct.variants.length > 0 && (
              <select
                value={newLineVariantId}
                onChange={(event) => setNewLineVariantId(event.target.value)}
                aria-label="Variant to add"
                disabled={!isDraft}
                className={PICKER_CLASS}
              >
                <option value="">No variant</option>
                {selectedProduct.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name} (+{money(variant.extraPrice)})
                  </option>
                ))}
              </select>
            )}

            <input
              type="number"
              min={1}
              value={newLineQuantity}
              onChange={(event) => setNewLineQuantity(event.target.value)}
              aria-label="Quantity to add"
              disabled={!isDraft}
              className={`${PICKER_CLASS} tabular w-[6rem]`}
            />

            <Button
              variant="secondary"
              onClick={handleAddLine}
              disabled={!isDraft || busy || newLineProductId === ''}
            >
              Add line
            </Button>
          </div>
        </TableToolbar>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Discount %</Th>
              <Th className="text-right">Limit</Th>
              <Th className="text-right">Line total</Th>
              <Th>Status</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line) => {
              const risk = lineRisk.get(line.id) ?? { applicableCeilingPct: 0, overagePct: 0 };

              return (
              <Tr key={line.id} className={risk.overagePct > 0 ? 'bg-tangerine/10' : undefined}>
                <Td>
                  <span className="block text-title-sm text-ink">{line.product.name}</span>
                  <span className="block text-label-md text-ink-subtle">
                    {line.product.sku} · {line.category.name}
                  </span>
                </Td>
                <Td numeric>{Number(line.quantity)}</Td>
                <Td numeric>{money(line.unitPrice)}</Td>
                <Td numeric>
                  {isDraft ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      defaultValue={Number(line.discountPct)}
                      aria-label={`Discount for ${line.product.name}`}
                      disabled={recalculatingLineId === line.id}
                      onBlur={(event) => void commitDiscount(line, event.target.value)}
                      className="frost-input tabular w-24 rounded-full px-sm py-[0.25rem] text-right text-body-md
                        focus:outline-none focus:ring-2 focus:ring-lemon/60 disabled:opacity-50"
                    />
                  ) : (
                    percent(line.discountPct)
                  )}
                </Td>
                <Td numeric>{percent(risk.applicableCeilingPct)}</Td>
                <Td numeric>{money(line.lineTotal)}</Td>
                <Td>
                  <LineStatus overagePct={risk.overagePct} />
                </Td>
                <Td>
                  {isDraft ? (
                    <button
                      type="button"
                      aria-label={`Remove ${line.product.name}`}
                      title="Remove line"
                      onClick={() => void handleDeleteLine(line.id)}
                      className="rounded-full px-xs py-2xs text-ink-subtle transition-colors hover:bg-white/70 hover:text-danger"
                    >
                      &times;
                    </button>
                  ) : (
                    <RowMenuButton />
                  )}
                </Td>
              </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableShell>

      {isDraft && (
        <UpsellPanel
          quotationId={id}
          linesKey={quotation.lines.map((line) => line.id).join(',')}
          onAccepted={(updated) => {
            setQuotation(updated);
            setRouting(null);
          }}
        />
      )}

      {/* What the customer asked for from the portal. The panel renders nothing
          when nothing has ever been asked, so a quiet quote stays quiet. */}
      <NegotiationPanel quotationId={id} onQuotationChanged={() => void load()} />

      {quotation.approvalSteps.length > 0 && (
        <Card className="mt-lg">
          <CardLabel>Approval chain</CardLabel>
          <ol className="mt-sm flex flex-wrap items-center gap-sm">
            {quotation.approvalSteps
              .slice()
              .sort((a, b) => a.sequence - b.sequence)
              .map((step, index) => (
                <li key={step.id} className="flex items-center gap-sm">
                  {index > 0 && <span className="text-ink-subtle">→</span>}
                  <Badge variant={step.status === 'APPROVED' ? 'info' : 'neutral'}>
                    {humanise(step.level)} · {humanise(step.status)}
                  </Badge>
                </li>
              ))}
          </ol>
          <Button
            variant="ghost"
            className="mt-md"
            onClick={() => navigate(`/approvals/${quotation.id}`)}
          >
            Open approval detail
          </Button>
        </Card>
      )}
    </InternalLayout>
  );
}
