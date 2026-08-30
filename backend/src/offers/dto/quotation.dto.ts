import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QuotationAmountsDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vehicleAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freightAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) insuranceAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) customsAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transitAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherCostsAmount = 0;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) marginAmount = 0;
  @Type(() => Number) @IsNumber() @Min(0.01) finalCustomerPrice: number;
  @IsOptional() @IsString() @MaxLength(1000) paymentConditions?: string;
  @IsOptional() @IsString() @MaxLength(500) validityNote?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateQuotationDto extends QuotationAmountsDto {
  @IsUUID() dossierId: string;
  @IsOptional() @IsUUID() sourceOfferId?: string;
  @IsIn(['CIF', 'DDP']) priceBasis: string;
  @IsString() @MaxLength(8) currency: string;
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
  @IsOptional() @IsString() status?: string;
}
