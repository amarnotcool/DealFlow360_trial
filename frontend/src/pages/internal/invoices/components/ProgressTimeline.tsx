// The cash journey of one invoice: Order Confirmed → Shipped → Invoiced → Paid.
//
// Every stage is derived from data the API returned — the order's status, the
// invoice's issue date, its balance — so a stage is never marked done on a
// guess. A stage that does not apply to this invoice says so rather than
// rendering as an unreached step.

import { cn } from '../../../../components/ui';

export type StageState = 'done' | 'current' | 'pending' | 'skipped';

export interface TimelineStage {
  label: string;
  state: StageState;
  detail: string;
}

const DOT_CLASS: Record<StageState, string> = {
  done: 'bg-obsidian text-white border-obsidian',
  current: 'bg-lemon text-obsidian border-lemon shadow-glow-lemon',
  pending: 'bg-white/70 text-ink-subtle border-hairline',
  skipped: 'bg-white/70 text-ink-subtle border-dashed border-ink-subtle/40',
};

export function ProgressTimeline({ stages }: { stages: TimelineStage[] }) {
  return (
    <ol className="flex flex-col gap-md md:flex-row md:items-start md:gap-0">
      {stages.map((stage, index) => (
        <li key={stage.label} className="flex flex-1 items-start gap-sm md:flex-col md:gap-xs">
          <div className="flex items-center gap-sm md:w-full">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-label-md',
                DOT_CLASS[stage.state],
              )}
              aria-hidden
            >
              {stage.state === 'done' ? '✓' : stage.state === 'skipped' ? '–' : index + 1}
            </span>
            {index < stages.length - 1 && (
              <span
                className={cn(
                  'hidden h-[2px] flex-1 md:block',
                  stage.state === 'done' ? 'bg-obsidian/70' : 'bg-hairline',
                )}
              />
            )}
          </div>
          <div className="md:pr-md">
            <p
              className={cn(
                'text-title-sm',
                stage.state === 'pending' || stage.state === 'skipped' ? 'text-ink-subtle' : 'text-ink',
              )}
            >
              {stage.label}
            </p>
            <p className="text-body-sm text-ink-subtle">{stage.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
