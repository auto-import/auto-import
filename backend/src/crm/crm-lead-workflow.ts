import { ConflictException } from '@nestjs/common';
import {
  CrmLeadStatus,
  type CrmLeadStatus as Status,
} from '@auto-import/contracts';

export const CRM_LEAD_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> =
  {
    [CrmLeadStatus.NEW]: [CrmLeadStatus.CONTACTED],
    [CrmLeadStatus.CONTACTED]: [CrmLeadStatus.QUALIFIED],
    [CrmLeadStatus.QUALIFIED]: [CrmLeadStatus.APPOINTMENT],
    [CrmLeadStatus.APPOINTMENT]: [CrmLeadStatus.CONVERTED],
    [CrmLeadStatus.CONVERTED]: [],
  };

export function assertCrmLeadTransition(from: string | null, to: Status) {
  if (!from) {
    throw new ConflictException({
      code: 'CRM_RECONCILIATION_REQUIRED',
      message: 'Resolve the legacy CRM status before changing this lead',
    });
  }
  if (from === to) return;
  if (!CRM_LEAD_TRANSITIONS[from as Status]?.includes(to)) {
    throw new ConflictException({
      code: 'INVALID_CRM_TRANSITION',
      message: `Invalid CRM transition ${from} -> ${to}`,
      allowed: CRM_LEAD_TRANSITIONS[from as Status] ?? [],
    });
  }
}

export function legacyStatusProjection(status: Status): string {
  return {
    NEW: 'new',
    CONTACTED: 'contacted',
    QUALIFIED: 'qualified',
    APPOINTMENT: 'qualified',
    CONVERTED: 'converted',
  }[status];
}
