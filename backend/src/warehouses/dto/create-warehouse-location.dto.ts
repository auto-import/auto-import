import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateWarehouseLocationDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
