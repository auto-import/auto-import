import { IsEnum } from 'class-validator';
import { RecordStatus } from '@auto-import/contracts';

export class SetUserStatusDto {
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
