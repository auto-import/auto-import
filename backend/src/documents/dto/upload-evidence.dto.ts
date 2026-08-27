import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CHECKPOINTS = [
  'ARRIVAL_AT_PORT',
  'CUSTOMS',
  'PORT_EXIT',
  'LOCAL_TRANSPORT',
] as const;

export class UploadCheckpointEvidenceDto {
  @IsString()
  vehicleId: string;

  @IsIn(CHECKPOINTS)
  checkpoint: (typeof CHECKPOINTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}
