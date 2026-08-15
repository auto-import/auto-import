import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  activityDate?: string;

  @IsUUID()
  prospectId: string;
}
