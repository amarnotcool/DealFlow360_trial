// The contact's own details, straight from GET /portal/auth/me. Read-only:
// changing a contact record is the account manager's job, so there is no form
// here pretending otherwise.

import { PortalLayout } from '../../components/layout/PortalLayout';
import { Card, CardLabel, LoadingCard } from '../../components/ui';
import { usePortalAuth } from '../../features/auth/usePortalAuth';

export default function Profile() {
  const { contact, loading } = usePortalAuth();

  return (
    <PortalLayout title="Profile" subtitle="The details we have on file for you">
      {loading || !contact ? (
        <LoadingCard label="Profile" />
      ) : (
        <div className="grid gap-gutter md:grid-cols-2">
          <Card>
            <CardLabel>Contact</CardLabel>
            <p className="mt-xs text-headline-lg text-ink">{contact.fullName}</p>
            <p className="text-body-md text-ink-body">{contact.email}</p>
          </Card>
          <Card>
            <CardLabel>Company</CardLabel>
            <p className="mt-xs text-headline-lg text-ink">{contact.customerName}</p>
            <p className="text-body-md text-ink-subtle">
              Your account manager keeps these details up to date — send them a message on a
              quotation if anything here is wrong.
            </p>
          </Card>
        </div>
      )}
    </PortalLayout>
  );
}
