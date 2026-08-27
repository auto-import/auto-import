import { PaginatedResponseDto } from '../dto/response.dto';

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponseDto<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    items,
    pagination: {
      page,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
