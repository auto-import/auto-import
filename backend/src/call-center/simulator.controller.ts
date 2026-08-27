import { Body, Controller, Param, Post } from '@nestjs/common';
import { CallState } from '@prisma/client';
import { Permission } from '@auto-import/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CallCenterService } from './call-center.service';
import {
  InboundCallDto,
  InboundWhatsappDto,
  MessageStatusDto,
} from './dto/call-center.dto';

@Controller('call-center/simulator')
export class SimulatorController {
  constructor(private readonly service: CallCenterService) {}

  @Post('calls/inbound')
  @RequirePermission(Permission.CALL_CENTER_HANDLE)
  inboundCall(
    @Body() dto: InboundCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.service.assertSimulatorEnabled();
    return this.service.ingestCallEvent(
      'mock',
      {
        providerEventId: dto.providerEventId,
        providerCallId: dto.providerCallId,
        eventType: 'call.inbound',
        companyNumber: dto.companyNumber,
        externalNumber: dto.externalNumber,
        state: dto.state ?? CallState.QUEUED,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
      user.id,
      user.organizationId,
    );
  }

  @Post('whatsapp/inbound')
  @RequirePermission(Permission.WHATSAPP_HANDLE)
  inboundWhatsapp(
    @Body() dto: InboundWhatsappDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.service.assertSimulatorEnabled();
    return this.service.ingestWhatsappEvent(
      'mock',
      {
        providerEventId: dto.providerEventId,
        providerMessageId: dto.providerMessageId,
        eventType: 'message.inbound',
        companyNumber: dto.companyNumber,
        externalNumber: dto.externalNumber,
        text: dto.text,
        status: 'RECEIVED',
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
      user.id,
      user.organizationId,
    );
  }

  @Post('whatsapp/messages/:providerMessageId/status')
  @RequirePermission(Permission.WHATSAPP_HANDLE)
  messageStatus(
    @Param('providerMessageId') providerMessageId: string,
    @Body() dto: MessageStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.service.assertSimulatorEnabled();
    return this.service.updateMessageStatus(
      user.organizationId,
      providerMessageId,
      dto.status,
      dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    );
  }
}
