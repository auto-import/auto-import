import { IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @IsString()
  @MinLength(12)
  password: string;
}
