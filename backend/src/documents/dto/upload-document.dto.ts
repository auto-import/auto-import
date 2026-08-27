import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class UploadDossierDocumentDto {
  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsString()
  kind: string; // 'DOSSIER_DOCUMENT' | 'PROOF' | 'CONTRACT' | 'CUSTOMS_DOCUMENT' | 'PAYMENT_RECEIPT' | 'VEHICLE_PHOTO' | 'BUSINESS_DOCUMENT'

  @IsOptional()
  @IsString()
  documentType?: string; // 'id_client', 'contrat', 'pi_fournisseur', 'facture_fournisseur', 'preuve_paiement', 'rapport_inspection', 'bl_draft', 'bl_final', 'documents_douane', 'document_livraison'

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class FilterDossierDocumentsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
