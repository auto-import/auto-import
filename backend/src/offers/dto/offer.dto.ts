import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const currencies = ['DZD', 'USD', 'CNY', 'EUR'] as const;
const conditions = ['new', 'used'] as const;
export const incoterms = ['FCA', 'FOB', 'CIF', 'CFR', 'DDP'] as const;

export class CreateOfferVehicleDto {
  @IsString() brand: string;
  @IsString() model: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100) year?: number;
  @IsIn(conditions) condition: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsObject() specification?: Record<string, unknown>;
  @Type(() => Number) @Min(0.01) supplierPrice: number;
  @IsIn(currencies) currency: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity = 1;
}

export class CreateOfferDto {
  @IsUUID() supplierId: string;
  @IsString() brand: string;
  @IsString() model: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
  @IsIn(conditions) condition: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsObject()
  specification: Record<string, unknown>;
  @Type(() => Number) @Min(0.01) supplierPrice: number;
  @IsIn(currencies) currency: string;
  @IsOptional() @IsIn(incoterms) incoterm?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() paymentConditions?: string;
  @IsOptional() @IsString() vin?: string;
  @IsDateString() validFrom: string;
  @IsDateString() validUntil: string;
  @Type(() => Number) @IsInt() @Min(1) availableQuantity: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDelayDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOfferVehicleDto)
  vehicles?: CreateOfferVehicleDto[];
}

export class UpdateOfferDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
  @IsOptional() @IsIn(conditions) condition?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsObject() specification?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @Min(0) supplierPrice?: number;
  @IsOptional() @IsIn(currencies) currency?: string;
  @IsOptional() @IsString() supplierReference?: string;
  @IsOptional() @IsIn(incoterms) incoterm?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() paymentConditions?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) availableQuantity?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDelayDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() revisionReason?: string;
  @IsOptional() @IsString() notes?: string;
}

export class FilterOfferDto extends PaginationDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(conditions) condition?: string;
  @IsOptional() @IsDateString() validAt?: string;
}

export class ReserveOfferDto {
  @IsUUID() clientId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity = 1;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class ReleaseOfferDto {
  @IsOptional() @IsString() reason?: string;
}

export class MaterializeOfferDto {
  @IsString() vin: string;
  @IsOptional() @IsUUID() currentLocationId?: string;
}

export class TransitionOfferDto {
  @IsIn([
    'RECEIVED',
    'UNDER_VERIFICATION',
    'VALIDATED',
    'RESERVED',
    'PURCHASED',
    'EXPIRED',
    'LOST_DEAL',
  ])
  status: string;
  @IsOptional() @IsString() reason?: string;
}

export class PurchaseOfferVehicleDto {
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsUUID() currentLocationId?: string;
  @IsOptional() @Type(() => Number) @Min(0.01) purchasePrice?: number;
  @IsOptional() @IsDateString() purchaseDate?: string;
}

export class LoseOfferVehicleDto {
  @IsString() reason: string;
}

export class AssignOfferDto {
  @IsUUID() dossierId: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreatePurchaseFromOfferDto extends AssignOfferDto {
  @IsString() vin: string;
  @IsOptional() @IsUUID() currentLocationId?: string;
}
