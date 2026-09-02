import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterCatalogueDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() acquisitionType?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}
