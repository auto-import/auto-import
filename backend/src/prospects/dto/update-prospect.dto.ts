import { IsString, IsOptional, IsEmail, IsUUID, IsEnum } from 'class-validator';
import { ProspectStatus } from '@auto-import/contracts';
import { LeadQualification } from '@prisma/client';

export class UpdateProspectDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  wilaya?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(ProspectStatus)
  status?: ProspectStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;

  @IsOptional()
  @IsString()
  nextActionAt?: string;
}
