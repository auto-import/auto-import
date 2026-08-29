import { IsOptional, IsString } from 'class-validator';

export class ArchiveClientDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
