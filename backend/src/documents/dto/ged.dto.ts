import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const GED_VALIDATION_STATUSES = [
  'TO_VALIDATE',
  'VALIDATED',
  'REJECTED',
] as const;

export const GED_SENSITIVITIES = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED_IDENTITY',
  'RESTRICTED_BANK',
  'RESTRICTED_PAYMENT',
  'RESTRICTED_CONTRACT',
  'RESTRICTED_CUSTOMS',
] as const;

export class GedEntityLinkDto {
  @IsOptional() @IsString() prospectId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() dossierId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() chinaOfferId?: string;
  @IsOptional() @IsString() purchaseId?: string;
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsString() customsFileId?: string;
  @IsOptional() @IsString() paymentId?: string;
}

export class UploadGedDocumentDto extends GedEntityLinkDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() documentTypeId?: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() issuingAuthority?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsIn(GED_SENSITIVITIES) sensitivity?: string;
  @IsOptional() @IsString() changeReason?: string;
}

export class CreateGedVersionDto {
  @IsString() changeReason: string;
}

export class FilterGedDocumentsDto extends PaginationDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() documentTypeId?: string;
  @IsOptional() @IsIn(GED_VALIDATION_STATUSES) validationStatus?: string;
  @IsOptional() @IsIn(GED_SENSITIVITIES) sensitivity?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') archived?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') expiringSoon?: boolean;
  @IsOptional() @IsString() prospectId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() dossierId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() chinaOfferId?: string;
  @IsOptional() @IsString() purchaseId?: string;
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsString() customsFileId?: string;
  @IsOptional() @IsString() paymentId?: string;
}

export class TransitionGedDocumentDto {
  @IsIn(['VALIDATED', 'REJECTED']) status: 'VALIDATED' | 'REJECTED';
  @ValidateIf((dto: TransitionGedDocumentDto) => dto.status === 'REJECTED')
  @IsString()
  reason?: string;
}

export class ArchiveGedDocumentDto {
  @IsString() reason: string;
}

export class UpsertGedReferenceDto {
  @IsString() code: string;
  @IsString() labelFr: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(GED_SENSITIVITIES) defaultSensitivity?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class UpsertChecklistRuleDto {
  @IsString() documentTypeId: string;
  @IsOptional() @IsString() dossierType?: string;
  @IsOptional() @IsString() workflowStatus?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() blocking?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) expiryWarningDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
