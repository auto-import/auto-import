import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsUUID,
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
  @IsDateString()
  passportExpiry?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

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
