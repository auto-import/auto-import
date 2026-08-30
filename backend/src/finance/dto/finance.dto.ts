import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreatePaymentPlanDto {
  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  strategy?: string; // 'THIRTY_SEVENTY' | 'FULL_UPFRONT'
}

export class FilterPaymentPlansDto extends PaginationDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class PaymentAllocationItemDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  installmentId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class RecordPaymentDto {
  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  installmentId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  exchangeRateId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationItemDto)
  allocations?: PaymentAllocationItemDto[];
}

export class ReversePaymentDto {
  @IsString()
  reason: string;
}

export class FilterPaymentsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class CreateCustomerDepositDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  prospectId?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyCustomerDepositDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  installmentId?: string;
}

export class CreateSupplierPaymentDto {
  @IsString()
  supplierId: string;

  @IsString()
  purchaseId: string;

  @IsIn(['DEPOSIT', 'COMPLEMENT', 'BALANCE'])
  paymentKind: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  exchangeRateId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReverseSupplierPaymentDto {
  @IsString()
  reason: string;
}

export class FilterSupplierPaymentsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  purchaseId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class CreateCostDto {
  @IsString()
  type: string; // 'PURCHASE' | 'SUPPLIER' | 'SHIPPING' | 'CUSTOMS' | 'DUTY' | 'TAX' | 'INSURANCE' | 'STORAGE' | 'OTHER'

  @IsOptional()
  @IsString()
  costScope?: string; // DIRECT | OPERATING

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  exchangeRateId?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  purchaseId?: string;

  @IsOptional()
  @IsString()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  customsFileId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  treasuryAccountId?: string;

  @IsOptional()
  @IsString()
  supportingDocumentId?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class ConfirmFinanceEntryDto {
  @IsOptional()
  @IsString()
  treasuryAccountId?: string;

  @IsOptional()
  @IsString()
  supportingDocumentId?: string;
}

export class ReverseCostDto {
  @IsString()
  reason: string;
}

export class FilterCostsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  purchaseId?: string;

  @IsOptional()
  @IsString()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  customsFileId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateExchangeRateDto {
  @IsString()
  baseCurrency: string;

  @IsString()
  quoteCurrency: string;

  @IsNumber()
  @IsPositive()
  rate: number;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class FilterExchangeRatesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  quoteCurrency?: string;
}
