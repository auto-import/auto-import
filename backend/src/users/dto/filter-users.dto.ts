import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RecordStatus } from '@auto-import/contracts';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FilterUsersDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;
}
