import {
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmPurchaseDto {
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @IsIn(['USD', 'CNY', 'DZD'])
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
