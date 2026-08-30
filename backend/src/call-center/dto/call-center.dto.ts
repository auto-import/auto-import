import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  AgentPresenceStatus,
  AppointmentStatus,
  CallDirection,
  CallState,
  CompanyChannelKind,
  LeadQualification,
} from '@prisma/client';
import {
  CrmLeadStatus,
  type CrmLeadStatus as Status,
} from '@auto-import/contracts';

export class CreateChannelDto {
  @IsEnum(CompanyChannelKind)
  channel: CompanyChannelKind;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  normalizedNumber: string;

  @IsString()
  providerKey: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  queueName?: string;

  @IsOptional()
  @IsObject()
  routingConfig?: Record<string, unknown>;
}

export class InboundCallDto {
  @IsString()
  providerEventId: string;

  @IsString()
  providerCallId: string;

  @IsString()
  companyNumber: string;

  @IsString()
  externalNumber: string;

  @IsOptional()
  @IsEnum(CallState)
  state?: CallState;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class AssignCallDto {
  @IsUUID()
  toUserId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class TransitionCallDto {
  @IsEnum(CallState)
  state: CallState;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  providerEventId?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class DispositionCallDto {
  @IsString()
  @IsNotEmpty()
  outcome: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;

  @IsOptional()
  @IsEnum(CrmLeadStatus)
  crmStatus?: Status;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  nextActionAt?: string;

  @IsOptional()
  @IsDateString()
  callbackAt?: string;

  @IsOptional()
  @IsString()
  appointmentTitle?: string;

  @IsOptional()
  @IsDateString()
  appointmentStart?: string;

  @IsOptional()
  @IsDateString()
  appointmentEnd?: string;
}

export class PresenceDto {
  @IsEnum(AgentPresenceStatus)
  status: AgentPresenceStatus;
}

export class InboundWhatsappDto {
  @IsString()
  providerEventId: string;

  @IsString()
  providerMessageId: string;

  @IsString()
  companyNumber: string;

  @IsString()
  externalNumber: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class ReplyWhatsappDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}

export class MessageStatusDto {
  @IsIn(['SENT', 'DELIVERED', 'READ', 'FAILED'])
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

  @IsString()
  providerEventId: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class CallListQueryDto {
  @IsOptional()
  @IsEnum(CallState)
  state?: CallState;

  @IsOptional()
  @IsString()
  view?: 'queue' | 'active' | 'missed' | 'history';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class CallHistoryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CallState)
  state?: CallState;

  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CreateManualCallDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsDateString()
  callAt: string;

  @IsEnum(CallDirection)
  direction: CallDirection;

  @IsUUID()
  agentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds: number;

  @IsOptional()
  @IsIn([CallState.COMPLETED, CallState.MISSED, CallState.FAILED])
  state?: CallState;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  outcome: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  dossierId?: string;
}

export class UpdateManualCallDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsDateString()
  callAt?: string;

  @IsOptional()
  @IsEnum(CallDirection)
  direction?: CallDirection;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds?: number;

  @IsOptional()
  @IsIn([CallState.COMPLETED, CallState.MISSED, CallState.FAILED])
  state?: CallState;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  dossierId?: string;
}

export class FollowUpQueryDto {
  @IsOptional()
  @IsIn(['today', 'overdue', 'upcoming', 'completed', 'cancelled'])
  queue?: 'today' | 'overdue' | 'upcoming' | 'completed' | 'cancelled';
}

export class TaskStatusDto {
  @IsIn(['todo', 'in_progress', 'completed', 'cancelled'])
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
}

export class CreateAppointmentDto {
  @IsUUID()
  assignedTo: string;

  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  title: string;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;

  @IsOptional()
  @IsString()
  outcome?: string;
}
