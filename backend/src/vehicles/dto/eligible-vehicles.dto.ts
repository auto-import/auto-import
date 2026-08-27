import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { DossierType } from '../../dossiers/dto/dossier-type.enum';

export class EligibleVehiclesDto extends PaginationDto {
  @IsEnum(DossierType)
  type: DossierType;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeExcluded?: boolean;
}
