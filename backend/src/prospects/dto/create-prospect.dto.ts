import { IsString, IsOptional, IsEmail, IsUUID, IsEnum } from 'class-validator';
import { LeadQualification } from '@prisma/client';

export class CreateProspectDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

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
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;
}
