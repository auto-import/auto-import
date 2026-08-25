import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateCustomsFileDto {
  @IsOptional()
  @IsString()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  brokerPartnerId?: string;

  @IsOptional()
  @IsString()
  declarationNumber?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  customsValue?: number;

  @IsOptional()
  @IsNumber()
  dutyAmount?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @IsOptional()
  @IsNumber()
  feesAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomsFileDto {
  @IsOptional()
  @IsString()
  brokerPartnerId?: string;

  @IsOptional()
  @IsString()
  declarationNumber?: string;

  @IsOptional()
  @IsNumber()
  customsValue?: number;

  @IsOptional()
  @IsNumber()
  dutyAmount?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @IsOptional()
  @IsNumber()
  feesAmount?: number;

  @IsOptional()
  @IsDateString()
  clearedAt?: string;

  @IsOptional()
  @IsDateString()
  releasedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransitionCustomsFileDto {
  @IsString()
  status: string; // 'open' | 'inInspection' | 'documentsRequired' | 'cleared' | 'released' | 'rejected' | 'closed'

  @IsOptional()
  @IsString()
  comment?: string;
}

export class FilterCustomsFilesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dossierId?: string;

  @IsOptional()
  @IsString()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  brokerPartnerId?: string;

  @IsOptional()
  @IsString()
  declarationNumber?: string;
}
