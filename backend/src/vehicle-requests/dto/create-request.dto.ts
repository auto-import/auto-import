import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'YearRangeValidator', async: false })
export class YearRangeValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const obj = args.object as { minYear?: number; maxYear?: number };
    if (obj.minYear != null && obj.maxYear != null) {
      return obj.minYear <= obj.maxYear;
    }
    return true;
  }
  defaultMessage() {
    return 'minYear must be less than or equal to maxYear';
  }
}

@ValidatorConstraint({ name: 'BudgetRangeValidator', async: false })
export class BudgetRangeValidator implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const obj = args.object as { budgetMin?: number; budgetMax?: number };
    if (obj.budgetMin != null && obj.budgetMax != null) {
      return obj.budgetMin <= obj.budgetMax;
    }
    return true;
  }
  defaultMessage() {
    return 'budgetMin must be less than or equal to budgetMax';
  }
}

export class CreateVehicleRequestDto {
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
