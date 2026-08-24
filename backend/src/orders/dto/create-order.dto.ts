import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@auto-import/contracts';

export class OrderItemDto {
  @IsUUID()
  vehicleId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreateOrderDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsUUID()
  dossierId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
