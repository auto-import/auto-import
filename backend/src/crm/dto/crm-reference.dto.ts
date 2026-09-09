import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCrmReferenceDto {
  @IsIn(['COUNTRY']) kind: 'COUNTRY';
  @IsString() @Matches(/\S/) @MaxLength(120) labelFr: string;
  @IsOptional()
  @IsString()
  @Matches(/^\s*[a-zA-Z0-9_-]{2,40}\s*$/)
  code?: string;
}

export class UpdateCrmReferenceDto {
  @IsOptional()
  @IsString()
  labelFr?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
