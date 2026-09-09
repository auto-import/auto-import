import { IsOptional, IsString, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCandidateDto {
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
