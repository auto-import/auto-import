import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class UpdateDossierDto {
  @IsOptional() @IsUUID() salesUserId?: string;
  @IsOptional() @IsUUID() opsUserId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive()
  dutyOverrideAmount?: number;
  @IsOptional() @IsString() dutyOverrideJustification?: string;
}
