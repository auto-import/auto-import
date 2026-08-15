import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateStockMovementDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @IsString()
  type: string; // "in" | "out" | "transfer"

  @IsOptional()
  @IsString()
  reason?: string;
}
