import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';

export class FilterDossierDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  salesUserId?: string;

  @IsOptional()
  @IsUUID()
  opsUserId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
