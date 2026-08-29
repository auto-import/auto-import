import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  CrmLeadStatus,
  type CrmLeadStatus as Status,
} from '@auto-import/contracts';

export class TransitionProspectDto {
  @IsEnum(CrmLeadStatus)
  status: Status;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ArchiveProspectDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
