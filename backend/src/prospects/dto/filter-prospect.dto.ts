import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LeadQualification } from '@prisma/client';
import { CrmLeadStatus } from '@auto-import/contracts';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterProspectDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CrmLeadStatus)
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional() @IsUUID() entryChannelId?: string;
  @IsOptional() @IsUUID() marketingSourceId?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  @IsOptional() @IsDateString() updatedFrom?: string;
  @IsOptional() @IsDateString() updatedTo?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
