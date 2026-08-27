import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword: string;
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule' })
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre' })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Le mot de passe doit contenir un symbole',
  })
  newPassword: string;
  @IsString() @MaxLength(200) confirmation: string;
}
