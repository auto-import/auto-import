import { IsOptional, IsUUID } from 'class-validator';

export class UpdateDossierDto {
  @IsOptional() @IsUUID() salesUserId?: string;
  @IsOptional() @IsUUID() opsUserId?: string;
}
