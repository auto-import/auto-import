import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterVehicleDto extends PaginationDto {
  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  acquisitionType?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsString() vin?: string;
}
