import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DossierType } from '../dto/dossier-type.enum';
import { DossierStatus } from '@auto-import/contracts';
import {
  WORKFLOW_STEPS_BY_TYPE,
  INITIAL_STATUS_BY_TYPE,
  TERMINAL_STATUSES,
  LEGACY_STATUS_ALIASES,
  LEGACY_WORKFLOW_STEPS_BY_TYPE,
} from './dossier-workflow.constants';

@Injectable()
export class DossierWorkflowService {
  /**
   * Normalize status if it is a legacy alias
   */
  normalizeStatus(status: string): string {
    if (!status) return status;
    return LEGACY_STATUS_ALIASES[status.toLowerCase()] || status;
  }

  /**
   * Get the initial default status for a dossier type
   */
  getInitialStatus(type: DossierType): DossierStatus {
    return INITIAL_STATUS_BY_TYPE[type] || DossierStatus.OFFER_SELECTED;
  }

  /**
   * Check whether a status is terminal
   */
  isTerminalStatus(status: string): boolean {
    if (!status) return false;
    return TERMINAL_STATUSES.has(this.normalizeStatus(status));
  }

  /**
   * Get all ordered workflow steps for a dossier type
   */
  getWorkflowSteps(type: DossierType, workflowVersion = 2): DossierStatus[] {
    return (workflowVersion >= 2
      ? WORKFLOW_STEPS_BY_TYPE[type]
      : LEGACY_WORKFLOW_STEPS_BY_TYPE[type]) || [];
  }

  /**
   * Get all allowed next transitions from currentStatus for a given dossier type
   */
  getAllowedTransitions(
    type: DossierType,
    currentStatus: string,
    workflowVersion = 2,
  ): DossierStatus[] {
    const rawStatus = currentStatus || '';

    // Terminal states cannot transition to anything
    if (this.isTerminalStatus(rawStatus)) {
      return [];
    }

    const steps = this.getWorkflowSteps(type, workflowVersion);
    if (!steps || steps.length === 0) {
      return [];
    }

    const normalized = this.normalizeStatus(rawStatus);
    const currentIndex = steps.indexOf(normalized as DossierStatus);

    const allowed: DossierStatus[] = [];

    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
      // Immediate next sequential step
      allowed.push(steps[currentIndex + 1]);
    }

    // Cancellation is always an allowed option from any non-terminal state
    if (!allowed.includes(DossierStatus.CANCELLED)) {
      allowed.push(DossierStatus.CANCELLED);
    }

    return allowed;
  }

  /**
   * Get the immediate next sequential status
   */
  getNextStatus(
    type: DossierType,
    currentStatus: string,
    workflowVersion = 2,
  ): DossierStatus | null {
    const rawStatus = currentStatus || '';
    if (this.isTerminalStatus(rawStatus)) {
      return null;
    }

    const steps = this.getWorkflowSteps(type, workflowVersion);
    const normalized = this.normalizeStatus(rawStatus);
    const currentIndex = steps.indexOf(normalized as DossierStatus);

    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
      return steps[currentIndex + 1];
    }

    return null;
  }

  /**
   * Validate a requested transition
   */
  validateTransition(
    type: DossierType,
    fromStatus: string,
    toStatus: string,
    workflowVersion = 2,
  ): void {
    const from = this.normalizeStatus(fromStatus || '');
    const to = this.normalizeStatus(toStatus || '');

    if (this.isTerminalStatus(from)) {
      throw new ConflictException(
        `Cannot transition from terminal status '${from}'. The dossier is finalized.`,
      );
    }

    if (from === to) {
      throw new BadRequestException(
        `Dossier is already in status '${from}'. Transition to the same status is not allowed.`,
      );
    }

    const allowed = this.getAllowedTransitions(type, from, workflowVersion);
    const normalizedTo = this.normalizeStatus(to);

    const isDirectlyAllowed =
      allowed.includes(to as DossierStatus) ||
      allowed.includes(normalizedTo as DossierStatus);

    if (!isDirectlyAllowed) {
      throw new ConflictException(
        `Invalid status transition for ${type}: cannot move from '${from}' to '${to}'. Allowed next transitions: [${allowed.join(', ')}]`,
      );
    }
  }
}
