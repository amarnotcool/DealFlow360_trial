import type { ApprovalCounts, ApprovalDetailView, ApprovalListItem } from '@dealflow360/shared';

import { apiGet, apiList, apiPost } from '../../lib/api-client';

export function fetchApprovals() {
  return apiList<ApprovalListItem, { total: number; counts: ApprovalCounts }>('/approvals');
}

export function fetchApproval(quotationId: string) {
  return apiGet<ApprovalDetailView>(`/approvals/${quotationId}`);
}

type Decision = 'approve' | 'reject' | 'return';

export function decideApproval(
  quotationId: string,
  decision: Decision,
  body: { actorUserId: string; reason?: string | null },
) {
  return apiPost<unknown>(`/approvals/${quotationId}/${decision}`, body);
}
