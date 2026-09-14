import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
}

export class ConfirmTwoFactorDto {
  @IsString() @Matches(/^\d{6}$/) code: string;
}

export class VerifyTwoFactorLoginDto {
  @IsString() @MinLength(1) @MaxLength(2048) challengeToken: string;
  @IsString() @MinLength(6) @MaxLength(39) code: string;
}

export class DisableTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(6) @MaxLength(39) code: string;
}

export class ResetTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(39) code?: string;
  @IsString() @MinLength(10) @MaxLength(500) @Matches(/\S/) reason: string;
}
