import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  IsArray,
  IsInt,
  Min,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { SUPPLIER_TYPES } from '../supplier-types';

export class CreatePartnerDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(['supplier', 'carrier', 'customsBroker', 'logistics', 'other'])
  type: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() @IsIn(SUPPLIER_TYPES) supplierType?: string;
  @ValidateIf((dto: CreatePartnerDto) => dto.supplierType === 'OTHER')
  @IsString()
  @IsNotEmpty()
  supplierTypeOther?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() wechat?: string;
  @IsOptional()
  @IsString()
  @IsIn(['USD', 'CNY'])
  preferredCurrency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) incoterms?: string[];
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  averageLeadTimeDays?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) specialties?: string[];
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'archived'])
  status?: string;
}
