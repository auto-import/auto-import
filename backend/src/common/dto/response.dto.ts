import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 42 })
  totalItems: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  path: string;
  statusCode: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: string[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
  timestamp: string;
  path: string;
  statusCode: number;
}
