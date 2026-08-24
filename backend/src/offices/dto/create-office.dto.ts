import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RecordStatus } from '@auto-import/contracts';

export class CreateOfficeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
