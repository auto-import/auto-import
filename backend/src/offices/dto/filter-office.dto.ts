import { IsEnum, IsOptional } from 'class-validator';
import { RecordStatus } from '@auto-import/contracts';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterOfficeDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
