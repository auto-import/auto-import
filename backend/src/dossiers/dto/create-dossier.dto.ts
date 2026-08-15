import { IsString, IsUUID, IsOptional } from 'class-validator';

export class CreateDossierDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  vehicleRequestId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
