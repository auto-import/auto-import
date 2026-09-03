import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsEnum,
  IsIn,
  Min,
  Max,
  IsObject,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleStatus } from '@auto-import/contracts';

export enum AcquisitionType {
  STOCK = 'stock',
  CLIENT_REQUEST = 'clientRequest',
  CHINA_OFFER = 'chinaOffer',
  EXTERNAL = 'external',
}

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  vin?: string;

  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1900)
  @Max(2030)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional() @IsString() trim?: string;
  @IsOptional() @IsString() bodyType?: string;
  @IsOptional() @IsString() drivetrain?: string;
  @IsOptional() @IsString() displacement?: string;
  @IsOptional() @IsString() steeringSide?: string;
  @IsOptional() @IsString() interiorColor?: string;
  @IsOptional() @IsString() warranty?: string;
  @IsOptional() @IsObject() equipment?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() lengthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() widthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() heightCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() weightKg?: number;
  @IsOptional() @IsString() rejectionReason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fobFcaPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  profitAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customsClearanceAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localTransportAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ddpPrice?: number;

  @IsOptional()
  @IsIn(['DZD', 'USD', 'CNY', 'EUR'])
  currency?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsEnum(AcquisitionType)
  acquisitionType: AcquisitionType;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  currentLocationId?: string;
}
