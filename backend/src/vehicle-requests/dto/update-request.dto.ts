import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { YearRangeValidator, BudgetRangeValidator } from './create-request.dto';

export class UpdateVehicleRequestDto {
  @IsOptional()
  @IsUUID()
  prospectId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Validate(YearRangeValidator)
  minYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  maxYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(BudgetRangeValidator)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  preferredColor?: string;

  @IsOptional()
  @IsString()
  requirements?: string;
}
