import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterCatalogueDto extends PaginationDto {
  @IsOptional() @IsIn(['VEHICLE', 'CHINA_OFFER']) sourceType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() acquisitionType?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}
