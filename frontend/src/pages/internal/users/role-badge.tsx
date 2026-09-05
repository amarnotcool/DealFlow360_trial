// One pill per role, so the directory and the detail screen agree on colour.

import type { RoleCode } from '@dealflow360/shared';

import { Badge } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui/Badge';
import { humanise } from '../../../lib/format';

/** Admin is the most capable role, so it carries the darkest pill. */
const ROLE_VARIANT: Record<RoleCode, BadgeVariant> = {
  ADMIN: 'dark',
  FINANCE: 'info',
  SALES_MANAGER: 'primary',
  SALES_REP: 'neutral',
};

export function RoleBadge({ role }: { role: RoleCode }) {
  return <Badge variant={ROLE_VARIANT[role]}>{humanise(role)}</Badge>;
}
