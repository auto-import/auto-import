import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  IsPositive,
  IsEnum,
  IsUUID,
  ArrayUnique,
  Matches,
  MaxLength,
} from 'class-validator';
import { ShipmentContainerType } from '@prisma/client';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateShipmentDto {
  @IsOptional()
  @IsEnum(ShipmentContainerType)
  containerType?: ShipmentContainerType;
  @IsOptional() @IsUUID() departurePortId?: string;
  @IsOptional() @IsUUID() arrivalPortId?: string;
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
  @ArrayUnique()
  @IsString({ each: true })
  vehicleIds?: string[];

  @IsOptional() @IsString() containerPresetId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  totalFreightCost?: number;
  @IsOptional() @IsIn(['USD', 'CNY', 'DZD']) freightCurrency?: string;
  @IsOptional() @IsString() freightExchangeRateId?: string;
}

export class UpdateShipmentDto {
  @IsOptional()
  @IsEnum(ShipmentContainerType)
  containerType?: ShipmentContainerType;
  @IsOptional() @IsUUID() departurePortId?: string;
  @IsOptional() @IsUUID() arrivalPortId?: string;
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

  @IsOptional() @IsString() containerPresetId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  totalFreightCost?: number;
  @IsOptional() @IsIn(['USD', 'CNY', 'DZD']) freightCurrency?: string;
  @IsOptional() @IsString() freightExchangeRateId?: string;
}

export class AddShipmentVehicleDto {
  @IsString() vehicleId: string;
  @IsOptional() @IsBoolean() capacityOverride = false;
  @IsOptional() @IsString() overrideReason?: string;
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

export class CreatePortDto {
  @IsString() @Matches(/\S/) @MaxLength(120) name: string;
  @IsString() @Matches(/^\s*[a-zA-Z0-9-]{2,20}\s*$/) code: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
}
