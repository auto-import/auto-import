import { IsIn, IsOptional, Matches } from 'class-validator';

export type DossierStatisticsPeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export class DossierStatisticsDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'year', 'custom'])
  period: DossierStatisticsPeriod = 'month';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
