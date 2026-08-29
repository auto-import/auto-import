import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsUUID,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { LeadQualification } from '@prisma/client';
import { LeadVehicleRequirementDto } from './create-prospect.dto';

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

  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsOptional() @IsUUID() entryChannelId?: string;
  @IsOptional() @IsUUID() marketingSourceId?: string;

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

  @IsOptional() @IsString() nextAction?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadVehicleRequirementDto)
  requirement?: LeadVehicleRequirementDto;
}
