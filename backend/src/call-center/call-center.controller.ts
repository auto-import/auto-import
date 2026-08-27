import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@auto-import/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CallCenterService } from './call-center.service';
import {
  AppointmentStatusDto,
  AssignCallDto,
  CallListQueryDto,
  CreateAppointmentDto,
  CreateChannelDto,
  DispositionCallDto,
  FollowUpQueryDto,
  PresenceDto,
  ReplyWhatsappDto,
  TaskStatusDto,
  TransitionCallDto,
} from './dto/call-center.dto';

@Controller('call-center')
export class CallCenterController {
  constructor(private readonly service: CallCenterService) {}

  @Get('channels')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  listChannels(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listChannels(user.organizationId);
  }

  @Post('channels')
  @RequirePermission(Permission.CHANNELS_MANAGE)
  createChannel(
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createChannel(user.organizationId, dto);
  }

  @Get('calls')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  listCalls(
    @Query() query: CallListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listCalls(user.organizationId, query);
  }

  @Get('calls/:id')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  getCall(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getCall(user.organizationId, id);
  }

  @Post('calls/:id/assign')
  @RequirePermission(Permission.CALL_CENTER_DISPATCH)
  assignCall(
    @Param('id') id: string,
    @Body() dto: AssignCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.assignCall(user.organizationId, id, user.id, dto);
  }

  @Post('calls/:id/state')
  @RequirePermission(Permission.CALL_CENTER_HANDLE)
  transitionCall(
    @Param('id') id: string,
    @Body() dto: TransitionCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.transitionCall(
      user.organizationId,
      id,
      user.id,
      dto.state,
      dto.reason,
      dto.providerEventId,
      dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    );
  }

  @Post('calls/:id/disposition')
  @RequirePermission(Permission.CALL_CENTER_HANDLE)
  dispositionCall(
    @Param('id') id: string,
    @Body() dto: DispositionCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.dispositionCall(user.organizationId, id, user.id, dto);
  }

  @Get('presence')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  listPresence(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPresence(user.organizationId);
  }

  @Get('agents')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  listAgents(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listAgents(user.organizationId);
  }

  @Patch('presence/me')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  setPresence(
    @Body() dto: PresenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setPresence(user.organizationId, user.id, dto.status);
  }

  @Post('presence/heartbeat')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  heartbeat(@CurrentUser() user: AuthenticatedUser) {
    return this.service.heartbeat(user.organizationId, user.id);
  }

  @Get('whatsapp/conversations')
  @RequirePermission(Permission.WHATSAPP_HANDLE)
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listConversations(user.organizationId);
  }

  @Get('whatsapp/conversations/:id')
  @RequirePermission(Permission.WHATSAPP_HANDLE)
  getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getConversation(user.organizationId, id);
  }

  @Post('whatsapp/conversations/:id/replies')
  @RequirePermission(Permission.WHATSAPP_HANDLE)
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyWhatsappDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.replyWhatsapp(user.organizationId, id, user.id, dto);
  }

  @Get('follow-ups')
  @RequirePermission(Permission.TASKS_READ)
  followUps(
    @Query() query: FollowUpQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listFollowUps(user.organizationId, query.queue);
  }

  @Patch('tasks/:id/status')
  @RequirePermission(Permission.TASKS_WRITE)
  taskStatus(
    @Param('id') id: string,
    @Body() dto: TaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setTaskStatus(user.organizationId, id, dto);
  }

  @Get('appointments')
  @RequirePermission(Permission.APPOINTMENTS_READ)
  appointments(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listAppointments(user.organizationId);
  }

  @Post('appointments')
  @RequirePermission(Permission.APPOINTMENTS_WRITE)
  createAppointment(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createAppointment(user.organizationId, user.id, dto);
  }

  @Patch('appointments/:id/status')
  @RequirePermission(Permission.APPOINTMENTS_WRITE)
  appointmentStatus(
    @Param('id') id: string,
    @Body() dto: AppointmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAppointmentStatus(user.organizationId, id, dto);
  }

  @Get('notifications')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  notifications(
    @Query('unread') unread: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listNotifications(user.id, unread === 'true');
  }

  @Patch('notifications/:id/read')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.markNotificationRead(user.id, id);
  }

  @Post('notifications/read-all')
  @RequirePermission(Permission.CALL_CENTER_ACCESS)
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllNotificationsRead(user.id);
  }

  @Get('kpis')
  @RequirePermission(Permission.CRM_KPI_OWN)
  kpis(
    @Query('from') fromValue: string | undefined,
    @Query('to') toValue: string | undefined,
    @Query('agentId') requestedAgentId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const to = toValue ? new Date(toValue) : new Date();
    const from = fromValue
      ? new Date(fromValue)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const agentId = user.permissions.includes(Permission.CRM_KPI_ORGANIZATION)
      ? requestedAgentId
      : user.id;
    return this.service.getKpis(user.organizationId, from, to, agentId);
  }
}
