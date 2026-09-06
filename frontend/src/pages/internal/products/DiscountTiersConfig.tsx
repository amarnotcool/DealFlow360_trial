// Screen 18, phase 1: the discount ceilings the engine applies.
//
// A `discount_rule` row is what `loadCeilings()` hands the discount engine, so
// what is edited here is exactly what scores the next quotation. Nothing on
// this screen recomputes an existing quote: a line already carries the ceiling
// and overage it was scored against, and those stay as they were approved.
//
// A tier's ceiling lives in two columns — the rule the engine reads and the
// `customer_tier` figure the customer and quotation screens display. The API
// writes both in one transaction, so the number shown next to a tier is always
// the number that will be enforced.
//
// The approval routing below is read-only: those bands are constants inside the
// pure engine, not rows, so there is nothing here that could save them. They
// are shown because a ceiling means little without the chain it triggers.

import { useEffect, useState } from 'react';
import type { DiscountRuleView } from '@dealflow360/shared';

import {
  Badge,
  Button,
  Card,
  CardLabel,
  ErrorCard,
  FIELD_CLASS,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { InternalLayout } from '../../../components/layout/InternalLayout';
import { useDiscountConfig } from '../../../features/discount-tiers/useDiscountConfig';
import { humanise, percent } from '../../../lib/format';

/** One editable ceiling. The row owns its own draft, so edits never collide. */
function CeilingRow({
  rule,
  busy,
  saved,
  onSave,
}: {
  rule: DiscountRuleView;
  busy: boolean;
  saved: boolean;
  onSave: (ceilingPct: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(rule.ceilingPct);
  const [problem, setProblem] = useState<string | null>(null);

  // A save re-reads the config; take the server's number as the new baseline.
  useEffect(() => {
    setDraft(rule.ceilingPct);
  }, [rule.ceilingPct]);

  const changed = Number(draft) !== Number(rule.ceilingPct);
  // The tier's displayed ceiling is written with the rule, so this can only be
  // false if something wrote around the API. Shown rather than assumed.
  const drifted = rule.tierCeilingPct !== null && rule.tierCeilingPct !== rule.ceilingPct;

  async function submit() {
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setProblem('A ceiling is a percentage between 0 and 100.');
      return;
    }

    setProblem(null);
    const ok = await onSave(Number(value.toFixed(2)));
    if (!ok) setDraft(rule.ceilingPct);
  }

  return (
    <Tr>
      <Td>
        <span className="text-title-sm text-ink">{rule.label}</span>
        {rule.description && (
          <span className="mt-2xs block text-body-sm text-ink-subtle">{rule.description}</span>
        )}
        {drifted && (
          <span className="mt-2xs block text-body-sm text-danger">
            Displayed elsewhere as {percent(rule.tierCeilingPct ?? '0')} — saving here re-syncs it.
          </span>
        )}
      </Td>

      <Td numeric>
        <div className="flex items-center justify-end gap-xs">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={draft}
            disabled={busy}
            aria-label={`${rule.label} ceiling percent`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && changed) void submit();
            }}
            className={`${FIELD_CLASS} tabular w-24 text-right`}
          />
          <span className="text-body-sm text-ink-subtle">%</span>
        </div>
        {problem && (
          <p role="alert" className="mt-2xs text-body-sm text-danger">
            {problem}
          </p>
        )}
      </Td>

      <Td>
        <div className="flex items-center gap-xs">
          <Button disabled={busy || !changed} onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {changed && !busy && (
            <Button variant="ghost" onClick={() => setDraft(rule.ceilingPct)}>
              Reset
            </Button>
          )}
          {!changed && saved && <Badge variant="info">Saved</Badge>}
        </div>
      </Td>
    </Tr>
  );
}

function CeilingTable({
  label,
  hint,
  rules,
  savingId,
  savedId,
  onSave,
}: {
  label: string;
  hint: string;
  rules: DiscountRuleView[];
  savingId: string | null;
  savedId: string | null;
  onSave: (ruleId: string, ceilingPct: number) => Promise<boolean>;
}) {
  if (rules.length === 0) return null;

  return (
    <TableShell className="mb-lg">
      <TableToolbar>
        <div>
          <CardLabel>{label}</CardLabel>
          <p className="mt-2xs text-body-sm text-ink-subtle">{hint}</p>
        </div>
        <Badge variant="neutral">{rules.length}</Badge>
      </TableToolbar>

      <Table aria-label={label}>
        <thead>
          <tr>
            <Th>Applies to</Th>
            <Th className="text-right">Ceiling</Th>
            <Th>{''}</Th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <CeilingRow
              key={rule.id}
              rule={rule}
              busy={savingId === rule.id}
              saved={savedId === rule.id}
              onSave={(ceilingPct) => onSave(rule.id, ceilingPct)}
            />
          ))}
        </tbody>
      </Table>
    </TableShell>
  );
}

export default function DiscountTiersConfig() {
  const { config, error, loading, savingId, savedId, save } = useDiscountConfig();

  async function onSave(ruleId: string, ceilingPct: number) {
    return save(ruleId, ceilingPct, null);
  }

  return (
    <InternalLayout
      breadcrumb={['Configuration']}
      title="Discount Tiers"
      actions={
        <Badge variant="neutral">
          {config ? `${config.rules.length} ceilings in force` : 'Loading'}
        </Badge>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {loading ? (
        <LoadingCard label="Discount configuration" />
      ) : config === null ? null : (
        <>
          <Card className="mb-lg">
            <CardLabel>What these ceilings do</CardLabel>
            <p className="mt-xs text-body-md text-ink-body">
              A line is scored against the lower of its customer&apos;s tier ceiling and its
              product category&apos;s ceiling. Anything above that is the line&apos;s overage, and
              the overages across a quotation decide whether it routes for approval.
            </p>
            <p className="mt-xs text-body-sm text-ink-subtle">
              Changing a ceiling affects quotations priced from now on. A quote already approved
              keeps the ceiling and overage it was approved against — those are frozen on its
              lines, and nothing here rewrites them.
            </p>
          </Card>

          <CeilingTable
            label="Tier ceilings"
            hint="How far a customer of this tier may be discounted, before category limits."
            rules={config.rules.filter((rule) => rule.scope === 'TIER')}
            savingId={savingId}
            savedId={savedId}
            onSave={onSave}
          />

          <CeilingTable
            label="Category ceilings"
            hint="A cap on the product side. The tighter of the two is the one that applies."
            rules={config.rules.filter((rule) => rule.scope === 'CATEGORY')}
            savingId={savingId}
            savedId={savedId}
            onSave={onSave}
          />

          <CeilingTable
            label="Global backstop"
            hint="Used when a customer's tier or a product's category has no ceiling of its own."
            rules={config.rules.filter((rule) => rule.scope === 'GLOBAL')}
            savingId={savingId}
            savedId={savedId}
            onSave={onSave}
          />

          <TableShell>
            <TableToolbar>
              <div>
                <CardLabel>Approval chains</CardLabel>
                <p className="mt-2xs text-body-sm text-ink-subtle">
                  How a blended risk score routes today. These bands are part of the discount
                  engine itself, not configuration, so they are shown here as they are applied.
                </p>
              </div>
              <Badge variant="neutral">
                Finance joins at {config.approvalRouting.highRiskThreshold}
              </Badge>
            </TableToolbar>

            <Table aria-label="Approval chains">
              <thead>
                <tr>
                  <Th>Risk</Th>
                  <Th>Blended score</Th>
                  <Th>Approval chain</Th>
                </tr>
              </thead>
              <tbody>
                {config.approvalRouting.bands.map((band) => (
                  <Tr key={band.riskLevel}>
                    <Td>
                      <Badge
                        variant={
                          band.riskLevel === 'HIGH'
                            ? 'critical'
                            : band.riskLevel === 'MEDIUM'
                              ? 'primary'
                              : 'neutral'
                        }
                      >
                        {humanise(band.riskLevel)}
                      </Badge>
                    </Td>
                    <Td className="tabular">{band.range}</Td>
                    <Td>
                      {band.chain.length === 0
                        ? 'Auto-approved on submit'
                        : band.chain.map((level) => humanise(level)).join(' → ')}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
        </>
      )}
    </InternalLayout>
  );
}
