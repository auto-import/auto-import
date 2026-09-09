import { IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterVehicleDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  inventoryOnly?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  shipmentAssignable?: boolean;
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
