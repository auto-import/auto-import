import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CandidateStatus {
  PROPOSED = 'proposed',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
}

export class CreateCandidateDto {
  @IsUUID()
  vehicleRequestId: string;

  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  proposedPrice?: number;

  @IsOptional()
  @IsIn(['USD', 'CNY', 'DZD'])
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
