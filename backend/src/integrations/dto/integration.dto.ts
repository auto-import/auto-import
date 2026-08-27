import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateIntegrationDto {
  @IsIn(['telephony', 'whatsapp'])
  kind: 'telephony' | 'whatsapp';

  @IsString()
  @MaxLength(80)
  providerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsObject()
  publicIdentifiers?: Record<string, string>;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsBoolean()
  enabled: boolean;
}
