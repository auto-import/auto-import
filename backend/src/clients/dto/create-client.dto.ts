import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;

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
  @IsString()
  nin?: string;

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
  @IsDateString()
  identityIssueDate?: string;

  @IsOptional()
  @IsDateString()
  passportExpiry?: string;
}
