import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  IsBoolean,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class TaskQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() assignedTo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
  @IsOptional() @IsString() relatedType?: string;
  @IsOptional() @IsUUID() relatedId?: string;
  @IsOptional() @IsIn(['mine', 'team']) view: 'mine' | 'team' = 'mine';
}

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID() assignedTo?: string;
  @IsOptional() @IsString() relatedType?: string;
  @IsOptional() @IsUUID() relatedId?: string;
  @IsOptional() @IsUUID() prospectId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() dossierId?: string;
  @IsOptional() @IsUUID() conversationId?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional()
  @IsIn(['todo', 'in_progress', 'completed', 'cancelled'])
  status?: string;
}

export class ReassignTaskDto {
  @IsUUID() assignedTo: string;
}

export class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['true', 'false']) unread?: string;
}

export class AuditQueryDto extends PageQueryDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class DateRangeDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() timezone?: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsIn(['fr-DZ', 'fr-FR', 'ar-DZ']) locale?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsIn(['DZD', 'USD', 'EUR', 'CNY']) baseCurrency?: string;
  @IsOptional() @IsString() dossierPrefix?: string;
  @IsOptional() @IsString() invoicePrefix?: string;
  @IsOptional() @IsObject() notificationDefaults?: Record<string, boolean>;
}

export class CreateNotificationTemplateDto {
  @IsString() name: string;
  @IsString() eventType: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() content: string;
  @IsOptional() @IsIn(['in_app', 'email']) channel?: string;
}

export class SendNotificationDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) userIds: string[] = [];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) roleIds: string[] = [];
  @IsOptional() @IsBoolean() allActive = false;
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) message: string;
  @IsOptional()
  @IsIn(['general', 'finance', 'logistics', 'commercial', 'system'])
  category = 'general';
  @IsOptional() @IsIn(['info', 'success', 'warning', 'critical']) severity =
    'info';
  @IsOptional() @IsString() @MaxLength(300) entityUrl?: string;
}
