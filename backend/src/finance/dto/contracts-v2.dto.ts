import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ContractScheduleItemDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CreateContractDto {
  @IsUUID() clientId!: string;
  @IsUUID() dossierId!: string;
  @IsNumber() @Min(0.01) totalAmount!: number;
  @IsString() @MaxLength(8) currency!: string;
  @IsOptional() @IsNumber() @Min(0) requiredDeposit?: number;
  @IsOptional() @IsUUID() signedDocumentId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractScheduleItemDto)
  schedule!: ContractScheduleItemDto[];
}

export class SignContractDto {
  @IsUUID() signedDocumentId!: string;
  @IsOptional() @IsDateString() signedAt?: string;
}

export class CreateContractCollectionDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MaxLength(8) currency!: string;
  @IsOptional() @IsString() @MaxLength(60) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
  @IsOptional() @IsString() @MaxLength(160) idempotencyKey?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}

export class CreateTreasuryAccountDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsIn(['CASH', 'BANK', 'CURRENCY', 'OTHER']) type!: string;
  @IsString() @MaxLength(8) currency!: string;
  @IsOptional() @IsNumber() openingBalance?: number;
}

export class ReverseFinanceTransactionDto {
  @IsString() @MaxLength(500) reason!: string;
}
