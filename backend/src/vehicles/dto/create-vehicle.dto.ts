import { IsString, IsOptional, IsNumber, IsUUID, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum AcquisitionType {
  STOCK = 'stock',
  CLIENT_REQUEST = 'client_request',
}

export enum VehicleStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold',
  IN_TRANSIT = 'in_transit',
  IN_CUSTOMS = 'in_customs',
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsString()
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
