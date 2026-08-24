import {
  IsUUID,
  IsOptional,
  IsArray,
  ArrayUnique,
  IsEnum,
} from 'class-validator';
import { DossierType } from './dossier-type.enum';

export class CreateDossierDto {
  @IsUUID()
  clientId: string;

  /**
   * Dossier business type (VEHICLE_SALE_CIF, VEHICLE_SALE_DDP, SHIPPING_ONLY)
   */
  @IsOptional()
  @IsEnum(DossierType, {
    message:
      'type must be one of: VEHICLE_SALE_CIF, VEHICLE_SALE_DDP, SHIPPING_ONLY',
  })
  type?: DossierType;

  @IsOptional()
  @IsUUID()
  vehicleRequestId?: string;

  /**
   * Single vehicle ID (retained for backward compatibility)
   */
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  /**
   * Multiple vehicle IDs to attach to the dossier
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  vehicleIds?: string[];

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
