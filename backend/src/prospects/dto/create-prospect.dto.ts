import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LeadQualification } from '@prisma/client';

export class LeadVehicleRequirementDto {
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2200) minYear?: number;
  @IsOptional() @IsInt() @Min(1900) @Max(2200) maxYear?: number;
  @IsOptional() @IsNumber() @Min(0) budgetMin?: number;
  @IsOptional() @IsNumber() @Min(0) budgetMax?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() preferredColor?: string;
  @IsOptional() @IsString() requirements?: string;
}

export class CreateProspectDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  wilaya?: string;

  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsUUID() countryId?: string;
  @IsUUID() entryChannelId: string;
  @IsUUID() marketingSourceId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(LeadQualification)
  qualification?: LeadQualification;

  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsString() nextActionAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadVehicleRequirementDto)
  requirement?: LeadVehicleRequirementDto;
}
