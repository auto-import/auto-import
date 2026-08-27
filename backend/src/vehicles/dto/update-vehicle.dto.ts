import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsEnum,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AcquisitionType } from './create-vehicle.dto';
import { VehicleStatus } from '@auto-import/contracts';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

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

  @IsOptional()
  @IsEnum(AcquisitionType)
  acquisitionType?: AcquisitionType;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  currentLocationId?: string;
}
