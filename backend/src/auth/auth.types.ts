import type { Permission as PermissionValue } from '@auto-import/contracts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  locale: 'fr' | 'en';
  office: { id: string; name: string } | null;
  roles: Array<{ id: string; name: string; scope: string }>;
  permissions: PermissionValue[];
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}
