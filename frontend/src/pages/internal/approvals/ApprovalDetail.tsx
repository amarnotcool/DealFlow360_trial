// Screen 6 (specs.md §6): why the quote was flagged, and the decision controls.
//
// The breakdown is the frozen risk_score_factor snapshot the engine produced —
// every ceiling, overage and contribution shown here comes from the API.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ApiError, ApprovalDetailView } from '@dealflow360/shared';

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
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { FINANCE, SALES_MANAGER } from '../../../config/current-user';
import { decideApproval, fetchApproval } from '../../../features/approvals/approvals.api';
import { dateTime, humanise, money, percent } from '../../../lib/format';

const STEP_BADGE = {
  PENDING: 'neutral',
  APPROVED: 'info',
  REJECTED: 'critical',
  RETURNED: 'primary',
} as const;

export default function ApprovalDetail() {
  const { id = '' } = useParams();
  const [approval, setApproval] = useState<ApprovalDetailView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const response = await fetchApproval(id);
    setApproval(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The step waiting on a decision decides who is acting, until auth lands. */
  const pendingStep = approval?.timeline.find((step) => step.status === 'PENDING') ?? null;
  const actor = pendingStep?.level === 'FINANCE' ? FINANCE : SALES_MANAGER;

  async function decide(decision: 'approve' | 'reject' | 'return') {
    setBusy(true);
    const response = await decideApproval(id, decision, {
      actorUserId: actor.id,
      reason: reason.trim() || null,
    });
    setBusy(false);

    if (response.error) {
      setError(response.error);
      return;
    }
    setError(null);
    setReason('');
    await load();
  }

  if (error && !approval) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Approvals']} title="Approval">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!approval) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Approvals']} title="Approval">
        <LoadingCard label="Approval" />
      </InternalLayout>
    );
  }

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Approvals', approval.number]}
      title={`${approval.number} — ${approval.customer.name}`}
      actions={
        pendingStep ? (
          <>
            <Button variant="secondary" onClick={() => void decide('return')} disabled={busy}>
              Return for Revision
            </Button>
            <Button variant="secondary" onClick={() => void decide('reject')} disabled={busy}>
              Reject
            </Button>
            <Button onClick={() => void decide('approve')} disabled={busy}>
              {busy ? 'Working…' : `Approve as ${humanise(pendingStep.level)}`}
            </Button>
          </>
        ) : (
          <Badge variant="neutral">{humanise(approval.status)}</Badge>
        )
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
        <Card tone="obsidian">
          <CardLabel>Blended risk score</CardLabel>
          <CardMetric>{Number(approval.riskScore).toFixed(2)}</CardMetric>
          <div className="mt-xs">
            <RiskBadge level={approval.riskLevel} />
          </div>
        </Card>
        <Card>
          <CardLabel>Worst single line</CardLabel>
          <CardMetric>{percent(approval.maxSingleOveragePct)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">over its own ceiling</p>
        </Card>
        <Card>
          <CardLabel>Total overage</CardLabel>
          <CardMetric>{percent(approval.totalOveragePct)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">across every line</p>
        </Card>
        <Card>
          <CardLabel>Order total</CardLabel>
          <CardMetric>{money(approval.totalAmount)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {approval.customer.customerTier?.name ?? 'No tier'} · {approval.owner.fullName}
          </p>
        </Card>
      </div>

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Why this quote was flagged</h2>
            <p className="text-body-sm text-ink-subtle">
              Each line is checked against its own limit: min(tier ceiling, category ceiling).
            </p>
          </div>
          <Badge variant="critical">
            {approval.breakdown.filter((row) => row.flagged).length} flagged
          </Badge>
        </TableToolbar>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">Discount</Th>
              <Th className="text-right">Tier ceiling</Th>
              <Th className="text-right">Category ceiling</Th>
              <Th className="text-right">Applicable</Th>
              <Th className="text-right">Overage</Th>
              <Th className="text-right">Contribution</Th>
            </tr>
          </thead>
          <tbody>
            {approval.breakdown.map((row) => (
              <Tr
                key={row.lineId}
                className={row.flagged ? 'bg-tangerine/15 border-l-2 border-l-tangerine' : undefined}
              >
                <Td>
                  <span className="block text-title-sm text-ink">{row.product}</span>
                  <span className="block text-label-md text-ink-subtle">{row.category.name}</span>
                </Td>
                <Td numeric className={row.flagged ? 'font-semibold text-ink' : undefined}>
                  {percent(row.discountPct)}
                </Td>
                <Td numeric>{row.tierCeilingPct ? percent(row.tierCeilingPct) : '—'}</Td>
                <Td numeric>{row.categoryCeilingPct ? percent(row.categoryCeilingPct) : '—'}</Td>
                <Td numeric className="font-semibold">
                  {percent(row.applicableCeilingPct)}
                </Td>
                <Td numeric>
                  {row.flagged ? (
                    <Badge variant="critical">+{Number(row.overagePct).toFixed(2)}pt</Badge>
                  ) : (
                    <span className="text-ink-subtle">0.00</span>
                  )}
                </Td>
                <Td numeric>{row.contribution ? Number(row.contribution).toFixed(2) : '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {pendingStep && (
        <Card className="mb-lg">
          <CardLabel>Decision note</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            Recorded on the step and in the audit log. Acting as {actor.fullName}.
          </p>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why are you approving, returning or rejecting?"
            className="frost-input mt-sm w-full rounded-md px-md py-sm text-body-md text-ink-body
              placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
          />
        </Card>
      )}

      <Card>
        <CardLabel>Approval step timeline</CardLabel>
        <ol className="mt-md flex flex-col gap-md">
          {approval.timeline.map((step) => (
            <li key={step.id} className="flex flex-wrap items-center gap-md">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-obsidian text-label-md text-lemon">
                {step.sequence}
              </span>
              <span className="text-title-sm text-ink">{humanise(step.level)}</span>
              <Badge variant={STEP_BADGE[step.status]}>{humanise(step.status)}</Badge>
              <span className="text-body-sm text-ink-subtle">
                {step.decidedByUser
                  ? `${step.decidedByUser.fullName} · ${dateTime(step.decidedAt)}`
                  : `Assigned to ${step.assigneeUser?.fullName ?? 'nobody'}`}
              </span>
              {step.reason && <span className="text-body-sm text-ink-body">“{step.reason}”</span>}
            </li>
          ))}
        </ol>
      </Card>
    </InternalLayout>
  );
}
