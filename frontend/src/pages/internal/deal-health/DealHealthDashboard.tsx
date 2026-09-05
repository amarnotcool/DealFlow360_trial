// Screen 14 (specs.md §6): the three alerts deal health raises, and the two
// things a manager does about them.
//
// The detectors have no timer behind them (CLAUDE.md rule 6 — REST first), so
// "Scan now" is what runs them. Every word on a card comes from the API: the
// title and message are written by the detector that fired, and this screen
// does not paraphrase them.

import { useNavigate } from 'react-router-dom';
import type { AlertSeverity, AlertType, AlertView } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterPill,
  LoadingCard,
  RISK_BADGE_VARIANT,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import { useDealHealth } from '../../../features/deal-health/useDealHealth';
import { dateTime, humanise } from '../../../lib/format';
import { DEAL_HEALTH_WRITE_ROLES } from '../../../routes/access';

/** Customer-facing wording for each detector, and what it is measuring. */
const ALERT_TYPE: Record<AlertType, { label: string; detail: string }> = {
  STALLED_DEAL: { label: 'Stalled', detail: 'No movement on the quotation' },
  DISCOUNT_ANOMALY: { label: 'Discount anomaly', detail: "Well above the rep's own average" },
  DELIVERY_SLIPPAGE: { label: 'Delivery slippage', detail: 'Promised date has passed' },
};

// The shared enum is a value the Vite build cannot import from the CommonJS
// package, so the members are written as literals and cast, exactly as the
// quotation stages are on screen 3.
const TYPE_ORDER = [
  'STALLED_DEAL' as AlertType,
  'DISCOUNT_ANOMALY' as AlertType,
  'DELIVERY_SLIPPAGE' as AlertType,
];

/** Severity reuses the risk triad, so HIGH reads the same everywhere. */
const SEVERITY_VARIANT: Record<AlertSeverity, (typeof RISK_BADGE_VARIANT)[keyof typeof RISK_BADGE_VARIANT]> =
  {
    HIGH: RISK_BADGE_VARIANT.HIGH,
    MEDIUM: RISK_BADGE_VARIANT.MEDIUM,
    LOW: RISK_BADGE_VARIANT.NONE,
  };

/** The numbers the detector recorded, in the order they read best. */
function metadataLine(alert: AlertView): string | null {
  const meta = alert.metadata;

  if (alert.type === 'STALLED_DEAL' && meta.idleDays !== undefined) {
    return `Idle ${meta.idleDays} days · threshold ${meta.stalledAfterDays}`;
  }
  if (alert.type === 'DISCOUNT_ANOMALY' && meta.quoteDiscountPct !== undefined) {
    return `${meta.quoteDiscountPct}% on this quote · rep average ${meta.repAverageDiscountPct}% across ${meta.repQuoteCount} others`;
  }
  if (alert.type === 'DELIVERY_SLIPPAGE' && meta.daysLate !== undefined) {
    return `${meta.daysLate} days late · ${meta.fulfillmentIds?.length ?? 0} shipment(s) unshipped`;
  }
  return null;
}

export default function DealHealthDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Finance watches this board; the sales manager and admin work it.
  const canAct = user ? DEAL_HEALTH_WRITE_ROLES.includes(user.role) : false;

  const { alerts, meta, error, busy, notice, type, setType, scan, acknowledge, escalate } =
    useDealHealth();

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Deal Health"
      actions={
        canAct ? (
          <Button onClick={() => void scan()} disabled={busy}>
            {busy ? 'Scanning…' : 'Scan now'}
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {notice && (
        <div className="mb-lg">
          <Card tone="lemon">
            {/* The same strip reports a scan, an acknowledgement and an
                escalation, so it is labelled for the board, not the action. */}
            <CardLabel>Deal health</CardLabel>
            <p className="mt-xs text-body-md">{notice}</p>
          </Card>
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        {TYPE_ORDER.map((option) => (
          <Card key={option} tone={option === 'STALLED_DEAL' ? 'obsidian' : 'frost'}>
            <CardLabel>{ALERT_TYPE[option].label}</CardLabel>
            <CardMetric>{meta.byType[option]}</CardMetric>
            <p
              className={`text-body-sm ${
                option === 'STALLED_DEAL' ? 'text-obsidian-muted' : 'text-ink-subtle'
              }`}
            >
              {ALERT_TYPE[option].detail}
            </p>
          </Card>
        ))}
      </div>

      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <div className="flex flex-wrap items-center gap-xs">
          <FilterPill label="Type" value="All" active={type === null} onClick={() => setType(null)} />
          {TYPE_ORDER.map((option) => (
            <FilterPill
              key={option}
              label="Type"
              value={`${ALERT_TYPE[option].label} ${meta.byType[option]}`}
              active={type === option}
              onClick={() => setType(option)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          <Badge variant="neutral">{meta.byStatus.OPEN} open</Badge>
          <Badge variant="neutral">{meta.byStatus.ACKNOWLEDGED} acknowledged</Badge>
          <Badge variant="neutral">{meta.byStatus.ESCALATED} escalated</Badge>
        </div>
      </div>

      {alerts === null ? (
        <LoadingCard label="Alerts" />
      ) : alerts.length === 0 ? (
        <EmptyCard
          message={
            type
              ? `No active ${ALERT_TYPE[type].label.toLowerCase()} alerts.`
              : canAct
                ? 'No active alerts. Run a scan to check for stalled deals, discount anomalies and late shipments.'
                : 'No active alerts.'
          }
        />
      ) : (
        <div className="flex flex-col gap-gutter">
          {alerts.map((alert) => {
            const detail = metadataLine(alert);

            return (
              <Card key={alert.id} className="flex flex-col gap-sm">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="flex flex-wrap items-center gap-xs">
                    <Badge variant="dark">{ALERT_TYPE[alert.type].label}</Badge>
                    <Badge variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
                    {alert.status !== 'OPEN' && (
                      <Badge variant="info">{humanise(alert.status)}</Badge>
                    )}
                  </div>
                  <span className="text-body-sm text-ink-subtle">{dateTime(alert.triggeredAt)}</span>
                </div>

                <div>
                  <p className="text-title-md text-ink">{alert.title}</p>
                  <p className="mt-2xs text-body-md text-ink-body">{alert.message}</p>
                  {detail && <p className="tabular mt-xs text-body-sm text-ink-subtle">{detail}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div className="flex flex-wrap items-center gap-xs text-body-sm text-ink-subtle">
                    {alert.quotation && (
                      <>
                        <span className="text-ink">{alert.quotation.customer.name}</span>
                        <span>·</span>
                        <span>{alert.quotation.ownerUser.fullName}</span>
                        {alert.salesOrder && (
                          <>
                            <span>·</span>
                            <span>{alert.salesOrder.number}</span>
                          </>
                        )}
                        {alert.acknowledgedByUser && (
                          <>
                            <span>·</span>
                            <span>acknowledged by {alert.acknowledgedByUser.fullName}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-xs">
                    {/* specs.md §4: clicking an alert opens the related quotation. */}
                    {alert.quotation && (
                      <Button
                        variant="secondary"
                        onClick={() => navigate(`/quotations/${alert.quotation!.id}`)}
                      >
                        Open {alert.quotation.number}
                      </Button>
                    )}

                    {canAct && alert.status === 'OPEN' && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void acknowledge(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )}

                    {canAct && alert.status !== 'ESCALATED' && (
                      <Button variant="obsidian" disabled={busy} onClick={() => void escalate(alert.id)}>
                        Escalate
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!canAct && (
        <p className="mt-lg text-body-sm text-ink-subtle">
          Read only — the sales manager works this board.
        </p>
      )}
    </InternalLayout>
  );
}
