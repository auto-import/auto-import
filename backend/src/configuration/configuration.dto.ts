import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const VEHICLE_LOOKUP_KINDS = [
  'BRAND',
  'MODEL',
  'ENGINE',
  'TRANSMISSION',
  'FUEL_TYPE',
  'COLOR',
  'BODY_TYPE',
] as const;

export class LookupQueryDto {
  @IsOptional() @IsIn(VEHICLE_LOOKUP_KINDS) kind?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() includeInactive?: string;
}

export class CreateLookupValueDto {
  @IsIn(VEHICLE_LOOKUP_KINDS) kind: string;
  @IsString() value: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateLookupValueDto {
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateInsuranceRateDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  insuranceRatePercent?: number;
}

export class UpsertDutyRateDto {
  @IsString() category: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  ratePercent?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpsertDeliveryRateDto {
  @IsString() destination: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
