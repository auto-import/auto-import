import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateWarehouseDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
