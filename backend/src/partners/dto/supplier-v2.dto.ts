import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TransitionSupplierDto {
  @IsIn(['TO_VERIFY', 'VERIFIED', 'ACTIVE', 'SUSPENDED'])
  status: string;
  @IsOptional() @IsString() reason?: string;
}

export class CreateSupplierContactDto {
  @IsString() name: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() wechat?: string;
  @IsOptional() @IsBoolean() preferred?: boolean;
}

export class CreateSupplierBankDto {
  @IsString() label: string;
  @IsOptional() @IsString() bankName?: string;
  @IsString() currency: string;
  @IsObject() details: Record<string, unknown>;
}

export class UpdateSupplierBankDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class ArchiveSupplierBankDto {
  @IsString() reason: string;
}

export class CreateSupplierIncidentDto {
  @IsString() type: string;
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() occurredAt: string;
}

export class ResolveSupplierIncidentDto {
  @IsString() resolution: string;
}

export class UpdateSupplierScoreDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100) reliability: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) quality: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) delivery: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) communication: number;
}

export class LinkSupplierDossierDto {
  @IsUUID() dossierId: string;
  @IsOptional() @IsString() source?: string;
}

export class LinkSupplierVehicleDto {
  @IsUUID() vehicleId: string;
}
