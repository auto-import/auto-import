import { IsOptional, IsString } from 'class-validator';

export class AdvanceStatusDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
