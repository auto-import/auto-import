import { IsEmail, IsString, MinLength, IsOptional, IsUUID } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  roleIds?: string[];
}
