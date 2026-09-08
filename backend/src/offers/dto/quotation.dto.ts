import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QuotationOtherCostDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;
  @IsString() @IsIn(['USD', 'CNY', 'DZD']) currency: string;
  @IsString() @IsNotEmpty() @MaxLength(300) description: string;
}

export class QuotationAmountsDto {
  @Type(() => Number) @IsNumber() @Min(0.01) vehicleAmount: number;
  @IsString() @IsIn(['USD', 'CNY']) vehicleCurrency: string;
  @Type(() => Number) @IsNumber() @Min(0) containerPrice: number;
  @IsString() @IsIn(['USD', 'CNY']) containerCurrency: string;
  @Type(() => Number) @IsIn([3, 4]) containerAllocation: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  insuranceAmount?: number;
  @IsString() @IsIn(['USD', 'CNY']) insuranceCurrency: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) customsAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transitAmount?: number;
  @IsString() @IsIn(['DZD']) transitCurrency: string;
  @Type(() => Number) @IsNumber() @Min(0.01) sellingPriceDzd: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationOtherCostDto)
  otherCosts?: QuotationOtherCostDto[];
  @IsOptional() @IsString() @MaxLength(1000) paymentConditions?: string;
  @IsOptional() @IsString() @MaxLength(500) validityNote?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateQuotationDto extends QuotationAmountsDto {
  @IsUUID() sourceOfferId: string;
  @IsOptional() @IsUUID() sourceOfferVehicleId?: string;
  @IsIn(['CIF', 'DDP']) priceBasis: 'CIF' | 'DDP';
  @IsOptional() @IsString() @MaxLength(12) currency?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class ReviseQuotationDto extends QuotationAmountsDto {
  @IsString() @MaxLength(500) reason: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class TransitionQuotationDto {
  @IsIn(['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']) status: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class FilterQuotationDto extends PaginationDto {
  @IsOptional() @IsUUID() dossierId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() sourceOfferId?: string;
  @IsOptional() @IsUUID() sourceOfferVehicleId?: string;
  @IsOptional() @IsString() status?: string;
}
