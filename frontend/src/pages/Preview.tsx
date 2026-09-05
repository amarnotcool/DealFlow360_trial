// Internal component gallery — every primitive rendered once so the design
// system can be reviewed at a glance. This is not a product screen and it makes
// no API calls; the sample rows below are static fixtures.

import { InternalLayout } from '../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  Checkbox,
  FilterPill,
  IconButton,
  RiskBadge,
  RowMenuButton,
  SearchInput,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Thumb,
  Tr,
} from '../components/ui';

const SAMPLE_ROWS = [
  { sku: 'HW-LAPTOP-PRO-14', name: 'Laptop Pro 14', qty: 10, discount: '12.00', limit: '15.00', total: '10,56,000.00', risk: 'NONE' },
  { sku: 'SV-ONSITE-SETUP', name: 'Onsite Setup Service', qty: 1, discount: '18.00', limit: '10.00', total: '16,400.00', risk: 'HIGH' },
  { sku: 'HW-EXT-WARRANTY', name: 'Extended Warranty', qty: 2, discount: '10.00', limit: '15.00', total: '27,000.00', risk: 'NONE' },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-xl">
      <h2 className="mb-md text-title-md text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function Preview() {
  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Design']}
      title="Component gallery"
      actions={<Button variant="secondary">Export tokens</Button>}
    >
      <Section title="Typography scale">
        <Card>
          <p className="text-display-xl text-ink">Display XL — 12,50,000</p>
          <p className="text-headline-lg text-ink">Headline LG — Quotation Q-2026-0001</p>
          <p className="text-title-md text-ink">Title MD — Why this quote was flagged</p>
          <p className="text-title-sm text-ink">Title SM — Onsite Setup Service</p>
          <p className="text-body-md">Body MD — every line is checked against its own ceiling.</p>
          <p className="text-body-sm text-ink-subtle">Body SM — blended score combines worst line and total.</p>
          <p className="text-label-md uppercase text-ink-subtle">Label MD — column header</p>
          <p className="text-label-xs uppercase text-ink-subtle">Label XS — micro metadata</p>
          <p className="tabular mt-md text-title-md">Tabular figures 1,099,400.00 / 1,111,111.11</p>
        </Card>
      </Section>

      <Section title="Cards — Level 1 substrate and Level 2 focal blocks">
        <div className="grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardLabel>Open quotations</CardLabel>
            <CardMetric>24</CardMetric>
            <p className="text-body-sm text-ink-subtle">Frosted substrate card</p>
          </Card>

          <Card tone="lemon">
            <CardLabel>Pending approvals</CardLabel>
            <CardMetric>6</CardMetric>
            <p className="text-body-sm opacity-70">Primary metric card</p>
          </Card>

          <Card tone="tangerine">
            <CardLabel>At-risk deals</CardLabel>
            <CardMetric>3</CardMetric>
            <p className="text-body-sm opacity-80">Warning / logistics tone</p>
          </Card>

          <Card tone="obsidian">
            <CardLabel>Blended risk</CardLabel>
            <CardMetric>8.00</CardMetric>
            <p className="text-body-sm text-obsidian-muted">Dark focal hero</p>
            <Button className="mt-md">Review quote</Button>
          </Card>
        </div>
      </Section>

      <Section title="Buttons">
        <Card className="flex flex-wrap items-center gap-md">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary glass</Button>
          <Button variant="obsidian">Obsidian</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Filter">
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </IconButton>
          <IconButton label="Add line">
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </IconButton>
        </Card>
      </Section>

      <Section title="Badges and risk levels">
        <Card className="flex flex-wrap items-center gap-md">
          <Badge variant="critical">OVER (+8pt)</Badge>
          <Badge variant="info">Within limit</Badge>
          <Badge variant="neutral" dot>
            Delay +2d
          </Badge>
          <Badge variant="primary">Pending approval</Badge>
          <Badge variant="dark">Confirmed</Badge>
          <span className="mx-sm h-6 w-px bg-hairline" />
          <RiskBadge level="HIGH" score="8.00" />
          <RiskBadge level="MEDIUM" score="4.60" />
          <RiskBadge level="NONE" score="0.00" />
        </Card>
      </Section>

      <Section title="Search and filter controls">
        <Card className="flex flex-wrap items-center gap-md">
          <SearchInput placeholder="Search quotations" className="w-[20rem] max-w-full" />
          <FilterPill label="Stage" value="Pending Approval" active />
          <FilterPill label="Owner" value="Riya" />
          <FilterPill label="Period" value="This quarter" />
        </Card>
      </Section>

      <Section title="Table vessel">
        <TableShell>
          <TableToolbar>
            <div className="flex items-center gap-sm">
              <h3 className="text-title-sm text-ink">Quotation lines</h3>
              <Badge variant="neutral">3 lines</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-sm">
              <FilterPill label="Category" value="All" />
              <Button variant="secondary">Add line</Button>
            </div>
          </TableToolbar>

          <Table>
            <thead>
              <tr>
                <Th className="w-10">
                  <Checkbox aria-label="Select all rows" />
                </Th>
                <Th>Product</Th>
                <Th>Qty</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Limit</Th>
                <Th className="text-right">Line total</Th>
                <Th>Status</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row) => (
                <Tr key={row.sku}>
                  <Td>
                    <Checkbox aria-label={`Select ${row.name}`} />
                  </Td>
                  <Td>
                    <span className="flex items-center gap-sm">
                      <Thumb>{row.sku.slice(0, 2)}</Thumb>
                      <span>
                        <span className="block text-title-sm text-ink">{row.name}</span>
                        <span className="block text-label-md text-ink-subtle">{row.sku}</span>
                      </span>
                    </span>
                  </Td>
                  <Td numeric>{row.qty}</Td>
                  <Td numeric>{row.discount}%</Td>
                  <Td numeric>{row.limit}%</Td>
                  <Td numeric>{row.total}</Td>
                  <Td>
                    <RiskBadge level={row.risk} />
                  </Td>
                  <Td>
                    <RowMenuButton />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableShell>
      </Section>

      <Section title="Elevation reference">
        <div className="grid gap-gutter md:grid-cols-3">
          <Card>
            <CardLabel>Level 1</CardLabel>
            <p className="text-body-sm">Frosted substrate, blur 20px, soft ambient shadow.</p>
          </Card>
          <Card tone="lemon">
            <CardLabel>Level 2</CardLabel>
            <p className="text-body-sm">Solid focal block with chartreuse glow.</p>
          </Card>
          <Card className="bg-white shadow-floating">
            <CardLabel>Level 3</CardLabel>
            <p className="text-body-sm">Floating pill and dropdown surface.</p>
          </Card>
        </div>
      </Section>
    </InternalLayout>
  );
}
