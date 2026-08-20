import { IsUUID } from 'class-validator';

export class AddDossierVehicleDto {
  @IsUUID()
  vehicleId: string;
}
