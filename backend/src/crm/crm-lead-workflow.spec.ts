import { ConflictException } from '@nestjs/common';
import { CrmLeadStatus } from '@auto-import/contracts';
import {
  assertCrmLeadTransition,
  CRM_LEAD_TRANSITIONS,
  legacyStatusProjection,
} from './crm-lead-workflow';

describe('V2 CRM lead workflow', () => {
  it('contains the authoritative sequential workflow', () => {
    expect(CRM_LEAD_TRANSITIONS).toEqual({
      NEW: ['CONTACTED'],
      CONTACTED: ['QUALIFIED'],
      QUALIFIED: ['APPOINTMENT'],
      APPOINTMENT: ['CONTRACT'],
      CONTRACT: ['DEPOSIT'],
      DEPOSIT: ['CONVERTED'],
      CONVERTED: [],
    });
  });

  it('accepts the next transition and rejects skipping a stage', () => {
    expect(() =>
      assertCrmLeadTransition(CrmLeadStatus.NEW, CrmLeadStatus.CONTACTED),
    ).not.toThrow();
    expect(() =>
      assertCrmLeadTransition(CrmLeadStatus.NEW, CrmLeadStatus.QUALIFIED),
    ).toThrow(ConflictException);
  });

  it('requires reconciliation when a legacy status could not be mapped', () => {
    expect(() =>
      assertCrmLeadTransition(null, CrmLeadStatus.CONTACTED),
    ).toThrow(ConflictException);
  });

  it('keeps the legacy status as a read-only compatibility projection', () => {
    expect(legacyStatusProjection(CrmLeadStatus.DEPOSIT)).toBe('won');
    expect(legacyStatusProjection(CrmLeadStatus.CONVERTED)).toBe('converted');
  });
});
