// Screen 4 (specs.md §6): one quotation, its lines, and the live discount check.
//
// The ceiling and the overage on every line come from the API — the engine owns
// that maths. Editing a discount PATCHes the line and re-renders from whatever
// the server sends back; nothing is computed here.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApiError, QuotationDetailView, QuotationLineView } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
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
import { SALES_REP } from '../../../config/current-user';
import {
  addQuotationLine,
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
  const [newLineProductId, setNewLineProductId] = useState('');

  const load = useCallback(async () => {
    const response = await fetchQuotation(id);
    setQuotation(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Live discount check: commit on blur, then re-render from the server. */
  async function commitDiscount(line: QuotationLineView, raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next > 100 || next === Number(line.discountPct)) {
      return;
    }

    setRecalculatingLineId(line.id);
    const response = await updateQuotationLine(id, line.id, {
      actorUserId: SALES_REP.id,
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

  /** Minimal add-line control: a product id, quantity 1, no discount. The
      product picker arrives with the products module. */
  async function handleAddLine() {
    const productId = newLineProductId.trim();
    if (!productId) {
      return;
    }

    setBusy(true);
    const response = await addQuotationLine(id, {
      actorUserId: SALES_REP.id,
      productId,
      quantity: 1,
      discountPct: 0,
    });
    setBusy(false);

    if (response.data) {
      setQuotation(response.data);
      setNewLineProductId('');
      return;
    }
    setError(response.error);
  }

  async function handleDeleteLine(lineId: string) {
    setBusy(true);
    const response = await deleteQuotationLine(id, lineId, SALES_REP.id);
    setBusy(false);

    if (response.data) {
      setQuotation(response.data);
      return;
    }
    setError(response.error);
  }

  async function handleSubmit() {
    setBusy(true);
    const response = await submitQuotation(id, SALES_REP.id);
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
          <Button onClick={handleSubmit} disabled={!isDraft || busy}>
            {busy ? 'Working…' : 'Submit for Approval'}
          </Button>
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
          <div className="flex items-center gap-sm">
            <input
              value={newLineProductId}
              onChange={(event) => setNewLineProductId(event.target.value)}
              placeholder="Product id"
              aria-label="Product id to add"
              disabled={!isDraft}
              className="frost-input h-10 w-[20rem] max-w-full rounded-full px-md text-body-sm
                placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
            />
            <Button
              variant="secondary"
              onClick={handleAddLine}
              disabled={!isDraft || busy || newLineProductId.trim().length === 0}
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
