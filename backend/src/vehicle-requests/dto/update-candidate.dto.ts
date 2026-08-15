import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCandidateDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  proposedPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
