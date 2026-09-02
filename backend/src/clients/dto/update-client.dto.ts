import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;

  @IsOptional()
  @IsIn(['PASSPORT', 'NATIONAL_ID'])
  identityDocumentType?: 'PASSPORT' | 'NATIONAL_ID';

  @IsOptional()
  @IsString()
  identityIssueCountry?: string;

  @IsOptional()
  @IsString()
  nin?: string;

  @IsOptional()
  @IsDateString()
  identityIssueDate?: string;

  @IsOptional()
  @IsDateString()
  passportExpiry?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsUUID()
  nationalityCountryId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
