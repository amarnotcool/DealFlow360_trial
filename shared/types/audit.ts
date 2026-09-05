// Wire shapes for the audit trail (screen 6).
//
// An entry names its actor one of two ways: a staff user, or — when user_id
// is null — the portal contact the customer-side entry carries in its changes.

export interface AuditActorView {
  id: string;
  fullName: string;
}

export interface AuditTrailEntryView {
  id: string;
  entityType: string;
  action: string;
  reason: string | null;
  createdAt: string;
  actor: AuditActorView | null;
  portalContact: AuditActorView | null;
  changes: unknown;
}
