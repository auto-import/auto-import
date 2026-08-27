import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBrandingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName: string;
}
