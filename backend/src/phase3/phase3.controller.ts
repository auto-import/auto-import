import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation } from '@nestjs/swagger';
import { Permission } from '@auto-import/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AuditQueryDto,
  CreateNotificationTemplateDto,
  CreateTaskDto,
  DateRangeDto,
  NotificationQueryDto,
  ReassignTaskDto,
  SendNotificationDto,
  TaskQueryDto,
  UpdateSettingsDto,
  UpdateTaskDto,
} from './phase3.dto';
import { Phase3Service } from './phase3.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: Phase3Service) {}

  @Get()
  @RequirePermission(Permission.TASKS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskQueryDto) {
    return this.service.listTasks(user, query);
  }

  @Get(':id')
  @RequirePermission(Permission.TASKS_READ)
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getTask(user, id);
  }

  @Post()
  @RequirePermission(Permission.TASKS_WRITE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.service.createTask(user, dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.TASKS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.service.updateTask(user, id, dto);
  }

  @Patch(':id/complete')
  @RequirePermission(Permission.TASKS_WRITE)
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.updateTask(
      user,
      id,
      Object.assign(new UpdateTaskDto(), { status: 'completed' }),
    );
  }

  @Patch(':id/cancel')
  @RequirePermission(Permission.TASKS_WRITE)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.updateTask(
      user,
      id,
      Object.assign(new UpdateTaskDto(), { status: 'cancelled' }),
    );
  }

  @Patch(':id/reassign')
  @RequirePermission(Permission.TASKS_ASSIGN)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignTaskDto,
  ) {
    return this.service.reassignTask(user, id, dto.assignedTo);
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: Phase3Service) {}

  @Get()
  @RequirePermission(Permission.NOTIFICATIONS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.service.listNotifications(user, query);
  }

  @Get('unread-count')
  @RequirePermission(Permission.NOTIFICATIONS_READ)
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.service.unreadCount(user);
  }

  @Patch(':id/read')
  @RequirePermission(Permission.NOTIFICATIONS_READ)
  mark(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.markNotification(user, id);
  }

  @Post('read-all')
  @RequirePermission(Permission.NOTIFICATIONS_READ)
  all(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllNotifications(user);
  }

  @Get('audience')
  @RequirePermission(Permission.NOTIFICATIONS_SEND)
  audience(@CurrentUser() user: AuthenticatedUser) {
    return this.service.notificationAudience(user);
  }

  @Post('audience/resolve')
  @RequirePermission(Permission.NOTIFICATIONS_SEND)
  resolveAudience(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendNotificationDto,
  ) {
    return this.service.resolveNotificationAudience(user, dto);
  }

  @Post('send')
  @RequirePermission(Permission.NOTIFICATIONS_SEND)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendNotificationDto,
  ) {
    return this.service.sendNotification(user, dto);
  }

  @Get('templates/manage')
  @RequirePermission(Permission.NOTIFICATIONS_MANAGE)
  templates(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listTemplates(user);
  }

  @Post('templates/manage')
  @RequirePermission(Permission.NOTIFICATIONS_MANAGE)
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNotificationTemplateDto,
  ) {
    return this.service.createTemplate(user, dto);
  }
}

@Controller('audit')
export class AuditController {
  constructor(private readonly service: Phase3Service) {}
  @Get()
  @RequirePermission(Permission.AUDIT_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    return this.service.listAudit(user, query);
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: Phase3Service) {}
  @Get()
  @RequirePermission(Permission.DASHBOARD_READ)
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DateRangeDto,
  ) {
    return this.service.dashboard(user, query);
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly service: Phase3Service) {}

  @Get('summary')
  @RequirePermission(Permission.REPORTS_READ)
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DateRangeDto,
  ) {
    return this.service.reportSummary(user, query);
  }

  @Get('finance.csv')
  @ApiOperation({
    deprecated: true,
    summary: 'Deprecated CSV compatibility export',
  })
  @RequirePermission(Permission.REPORTS_EXPORT)
  async financeCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DateRangeDto,
    @Res() response: Response,
  ) {
    const report = await this.service.reportSummary(user, query);
    const escape = (value: unknown) => {
      let cell =
        value == null
          ? ''
          : typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean' ||
              typeof value === 'bigint'
            ? String(value)
            : value instanceof Date
              ? value.toISOString()
              : (JSON.stringify(value) ?? '');
      if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
      return `"${cell.replaceAll('"', '""')}"`;
    };
    response.status(200);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="rapport-finance.csv"',
    );
    response.write('\uFEFF');
    response.write(
      ['Indicateur', 'Valeur', 'Devise', 'Généré le', 'Fuseau horaire']
        .map(escape)
        .join(';') + '\r\n',
    );
    const rows = [
      ['Facturé', report.finance.issued],
      ['Encaissé', report.finance.collected],
      ['Reste à encaisser', report.finance.outstanding],
      ['Coûts', report.finance.costs],
      ['Marge brute', report.finance.grossMargin],
    ];
    for (const [label, value] of rows)
      response.write(
        [
          label,
          value,
          report.period.baseCurrency,
          report.generatedAt,
          report.period.timezone,
        ]
          .map(escape)
          .join(';') + '\r\n',
      );
    response.end();
  }

  @Get('finance.pdf')
  @RequirePermission(Permission.REPORTS_EXPORT)
  async financePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DateRangeDto,
    @Res() response: Response,
  ) {
    const pdf = await this.service.reportPdf(user, query);
    const date = new Date().toISOString().slice(0, 10);
    response.status(200);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="rapport-finance-${date}.pdf"`,
    );
    response.setHeader('Content-Length', pdf.length);
    response.end(pdf);
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: Phase3Service) {}
  @Get()
  @RequirePermission(Permission.SETTINGS_READ)
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getSettings(user);
  }
  @Patch()
  @RequirePermission(Permission.SETTINGS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.service.updateSettings(user, dto);
  }
}
