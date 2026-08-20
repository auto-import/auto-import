import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { DossierType } from '../dto/dossier-type.enum';
import {
  WORKFLOW_STEPS_BY_TYPE,
  INITIAL_STATUS_BY_TYPE,
  TERMINAL_STATUSES,
  LEGACY_STATUS_ALIASES,
} from './dossier-workflow.constants';

@Injectable()
export class DossierWorkflowService {
  /**
   * Normalize status if it is a legacy alias
   */
  normalizeStatus(status: string): string {
    if (!status) return status;
    const lower = status.toLowerCase();
    return LEGACY_STATUS_ALIASES[lower] || lower;
  }

  /**
   * Get the initial default status for a dossier type
   */
  getInitialStatus(type: DossierType): string {
    return INITIAL_STATUS_BY_TYPE[type] || 'offre_selectionnee';
  }

  /**
   * Check whether a status is terminal
   */
  isTerminalStatus(status: string): boolean {
    if (!status) return false;
    return TERMINAL_STATUSES.has(status.toLowerCase());
  }

  /**
   * Get all ordered workflow steps for a dossier type
   */
  getWorkflowSteps(type: DossierType): string[] {
    return WORKFLOW_STEPS_BY_TYPE[type] || [];
  }

  /**
   * Get all allowed next transitions from currentStatus for a given dossier type
   */
  getAllowedTransitions(type: DossierType, currentStatus: string): string[] {
    const rawStatus = (currentStatus || '').toLowerCase();
    
    // Terminal states cannot transition to anything
    if (this.isTerminalStatus(rawStatus)) {
      return [];
    }

    const steps = this.getWorkflowSteps(type);
    if (!steps || steps.length === 0) {
      return [];
    }

    const normalized = this.normalizeStatus(rawStatus);
    const currentIndex = steps.indexOf(normalized);

    const allowed: string[] = [];

    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
      // Immediate next sequential step
      allowed.push(steps[currentIndex + 1]);
    } else if (rawStatus === 'prospection') {
      // Backward compatibility for legacy 'prospection'
      allowed.push('client_confirme', 'contrat_signe');
    }

    // Cancellation is always an allowed option from any non-terminal state
    if (!allowed.includes('annule')) {
      allowed.push('annule');
    }

    return allowed;
  }

  /**
   * Get the immediate next sequential status
   */
  getNextStatus(type: DossierType, currentStatus: string): string | null {
    const rawStatus = (currentStatus || '').toLowerCase();
    if (this.isTerminalStatus(rawStatus)) {
      return null;
    }

    const steps = this.getWorkflowSteps(type);
    const normalized = this.normalizeStatus(rawStatus);
    const currentIndex = steps.indexOf(normalized);

    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
      return steps[currentIndex + 1];
    }

    if (rawStatus === 'prospection') {
      return steps[1] || steps[0]; // 'client_confirme'
    }

    return null;
  }

  /**
   * Validate a requested transition
   */
  validateTransition(type: DossierType, fromStatus: string, toStatus: string): void {
    const from = (fromStatus || '').toLowerCase();
    const to = (toStatus || '').toLowerCase();

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

    const allowed = this.getAllowedTransitions(type, from);
    const normalizedTo = this.normalizeStatus(to);

    const isDirectlyAllowed = allowed.includes(to) || allowed.includes(normalizedTo);

    if (!isDirectlyAllowed) {
      throw new ConflictException(
        `Invalid status transition for ${type}: cannot move from '${from}' to '${to}'. Allowed next transitions: [${allowed.join(', ')}]`,
      );
    }
  }
}
