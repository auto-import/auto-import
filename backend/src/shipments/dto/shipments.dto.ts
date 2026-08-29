import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateShipmentDto {
  @IsOptional()
  @IsString()
  carrierPartnerId?: string;

  @IsOptional()
  @IsString()
  blNumber?: string;

  @IsOptional()
  @IsString()
  vesselName?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  departurePort?: string;

  @IsOptional()
  @IsString()
  arrivalPort?: string;

  @IsOptional()
  @IsDateString()
  etd?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicleIds?: string[];
}

export class UpdateShipmentDto {
  @IsOptional()
  @IsString()
  carrierPartnerId?: string;

  @IsOptional()
  @IsString()
  blNumber?: string;

  @IsOptional()
  @IsString()
  vesselName?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  departurePort?: string;

  @IsOptional()
  @IsString()
  arrivalPort?: string;

  @IsOptional()
  @IsDateString()
  etd?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;

  @IsOptional()
  @IsDateString()
  actualDepartureDate?: string;

  @IsOptional()
  @IsDateString()
  actualArrivalDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransitionShipmentDto {
  @IsIn(['pending', 'booked', 'loading', 'inTransit', 'arrived', 'cancelled'])
  @IsString()
  status: string; // 'pending' | 'booked' | 'loading' | 'inTransit' | 'arrived' | 'delivered' | 'cancelled'

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateCustomsFromShipmentDto {
  @IsOptional()
  @IsString()
  responsibleUserId?: string;
}

export class FilterShipmentsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  carrierPartnerId?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  blNumber?: string;
}
