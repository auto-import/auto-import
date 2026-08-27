import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@auto-import/contracts';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
