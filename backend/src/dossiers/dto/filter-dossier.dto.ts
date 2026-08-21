import {
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { DossierType } from './dossier-type.enum';

export class FilterDossierDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DossierType)
  type?: DossierType;

  @IsOptional()
  @IsString()
  status?: string;

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
