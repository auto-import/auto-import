import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum StockMovementType {
  IN = 'in',
  OUT = 'out',
  TRANSFER = 'transfer',
}

export class CreateStockMovementDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @IsEnum(StockMovementType)
  type: StockMovementType;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
