import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const currencies = ['DZD', 'USD', 'CNY', 'EUR'] as const;
const conditions = ['new', 'used'] as const;

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
  @IsOptional() @Type(() => Number) @Min(0) purchasePrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) supplierPrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) cifPrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) ddpPrice?: number;
  @IsIn(currencies) currency: string;
  @IsOptional() @IsString() supplierReference?: string;
  @IsOptional() @IsString() incoterm?: string;
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
  @IsOptional() @Type(() => Number) @Min(0) purchasePrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) supplierPrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) cifPrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) ddpPrice?: number;
  @IsOptional() @IsIn(currencies) currency?: string;
  @IsOptional() @IsString() supplierReference?: string;
  @IsOptional() @IsString() incoterm?: string;
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
  @IsOptional() @Type(() => Number) @Min(0) purchasePrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) sellingPrice?: number;
  @IsOptional() @IsUUID() currentLocationId?: string;
}

export class TransitionOfferDto {
  @IsIn(['RECEIVED', 'UNDER_VERIFICATION', 'VALIDATED', 'REJECTED', 'RESERVED'])
  status: string;
  @IsOptional() @IsString() reason?: string;
}

export class AssignOfferDto {
  @IsUUID() dossierId: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreatePurchaseFromOfferDto extends AssignOfferDto {
  @IsString() vin: string;
  @IsOptional() @Type(() => Number) @Min(0) purchasePrice?: number;
  @IsOptional() @Type(() => Number) @Min(0) sellingPrice?: number;
  @IsOptional() @IsUUID() currentLocationId?: string;
}
