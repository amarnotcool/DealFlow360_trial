// Stands in for a module screen that has not been built yet, so the nav rail's
// active state is real and the shell can be reviewed. Replaced by the actual
// list and detail screens in the next step.

import { InternalLayout } from '../components/layout/InternalLayout';
import { Card, CardLabel } from '../components/ui';

export default function ModulePlaceholder({ title }: { title: string }) {
  return (
    <InternalLayout breadcrumb={['DealFlow360']} title={title}>
      <Card className="max-w-lg">
        <CardLabel>Not built yet</CardLabel>
        <p className="mt-sm text-body-md">
          The {title.toLowerCase()} list and detail screens land in the next step. The design
          foundation is on <span className="font-semibold">/preview</span>.
        </p>
      </Card>
    </InternalLayout>
  );
}
