import { IsEmail, IsString, MaxLength } from 'class-validator';

export class ChangeEmailDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsEmail()
  @MaxLength(320)
  newEmail: string;

  @IsEmail()
  @MaxLength(320)
  confirmation: string;
}
