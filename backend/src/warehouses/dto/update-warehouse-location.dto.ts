import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateWarehouseLocationDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
