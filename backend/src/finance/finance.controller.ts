import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @RequirePermission(Permission.FINANCE_READ)
  getOrganizationOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.finance.getOrganizationFinancialOverview(user.organizationId);
  }

  @Get('dossiers/:dossierId/summary')
  @RequirePermission(Permission.FINANCE_READ)
  getDossierSummary(
    @Param('dossierId') dossierId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.getDossierFinancialSummary(
      dossierId,
      user.organizationId,
    );
  }
}
