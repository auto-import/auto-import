import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DossierStatus } from '@auto-import/contracts';

export class UpdateStatusDto {
  @IsEnum(DossierStatus)
  status: DossierStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
