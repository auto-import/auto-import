import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DossierStatus } from '@auto-import/contracts';

export class DepositTransitionDataDto {
  @Type(() => Number) @IsPositive() amount: number;
  @IsString() currency: string;
  @IsString() paymentMethod: string;
  @IsDateString() receivedAt: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
}

export class VehicleBookingTransitionDataDto {
  @IsUUID() vehicleId: string;
  @IsDateString() bookingDate: string;
  @IsOptional() @IsString() note?: string;
}

export class PurchaseTransitionDataDto {
  @IsString() invoiceNumber: string;
  @Type(() => Number) @IsPositive() amount: number;
  @IsString() currency: string;
  @IsDateString() invoiceDate: string;
  @IsUUID() supplierId: string;
}

export class InspectionTransitionDataDto {
  @IsOptional() @IsUUID() documentId?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) url?: string;
  @IsOptional() @IsString() note?: string;
}

export class ShipmentBookingTransitionDataDto {
  @IsUUID() forwarderSupplierId: string;
  @IsOptional() @IsString() note?: string;
}

export class BillOfLadingTransitionDataDto {
  @IsUUID() documentId: string;
}

export class UpdateStatusDto {
  @IsEnum(DossierStatus)
  status: DossierStatus;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional() @ValidateNested() @Type(() => DepositTransitionDataDto)
  deposit?: DepositTransitionDataDto;
  @IsOptional() @ValidateNested() @Type(() => VehicleBookingTransitionDataDto)
  vehicleBooking?: VehicleBookingTransitionDataDto;
  @IsOptional() @ValidateNested() @Type(() => PurchaseTransitionDataDto)
  purchase?: PurchaseTransitionDataDto;
  @IsOptional() @ValidateNested() @Type(() => InspectionTransitionDataDto)
  inspection?: InspectionTransitionDataDto;
  @IsOptional() @ValidateNested() @Type(() => ShipmentBookingTransitionDataDto)
  shipmentBooking?: ShipmentBookingTransitionDataDto;
  @IsOptional() @ValidateNested() @Type(() => BillOfLadingTransitionDataDto)
  billOfLading?: BillOfLadingTransitionDataDto;
}

export class UpgradeDossierDto {
  @IsOptional() @IsString() reason?: string;
}
