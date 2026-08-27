import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
} from 'class-validator';
import { RecordStatus } from '@auto-import/contracts';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
