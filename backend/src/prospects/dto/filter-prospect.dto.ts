import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LeadQualification } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterProspectDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;
}
