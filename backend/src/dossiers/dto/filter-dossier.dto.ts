import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { DossierType } from './dossier-type.enum';
import { DossierStatus } from '@auto-import/contracts';

export class FilterDossierDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DossierType)
  type?: DossierType;

  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;

  @IsOptional()
  @IsUUID()
  salesUserId?: string;

  @IsOptional()
  @IsUUID()
  opsUserId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
