import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsNotEmpty,
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
  @IsIn(['USD', 'CNY', 'DZD']) currency!: string;
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
  @IsIn(['USD', 'CNY', 'DZD']) currency!: string;
  @IsOptional() @IsString() @MaxLength(60) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
  @IsOptional() @IsString() @MaxLength(160) idempotencyKey?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}

export class CreateTreasuryAccountDto {
  @IsUUID() officeId!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsIn(['CASH', 'BANK', 'CURRENCY', 'OTHER']) type!: string;
  @IsIn(['USD', 'CNY', 'DZD']) currency!: string;
  @IsOptional() @IsNumber() openingBalance?: number;
}

export class ReverseFinanceTransactionDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class TransferTreasuryDto {
  @IsUUID() sourceAccountId!: string;
  @IsUUID() destinationAccountId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsNumber() @Min(0.01) destinationAmount?: number;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) reference!: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional()
  @IsIn(['COMMERCIAL', 'BANK', 'INTERNAL', 'MANUAL'])
  rateType?: string;
}
export class UpdateTreasuryAccountDto {
  @IsOptional() @IsUUID() officeId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}
