import { IsIn } from 'class-validator';

export class UpdateLocaleDto {
  @IsIn(['fr', 'en'])
  locale: 'fr' | 'en';
}
