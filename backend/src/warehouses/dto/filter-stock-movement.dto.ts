import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterStockMovementDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
