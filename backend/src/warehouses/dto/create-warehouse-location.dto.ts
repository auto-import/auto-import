import { IsString, IsOptional } from 'class-validator';

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
