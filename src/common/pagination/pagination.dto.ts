import { PaginationQueryDto } from './pagination-query.dto';

/**
 * @deprecated Use PaginationQueryDto instead. Kept for backward compatibility.
 */
export class PaginationDto extends PaginationQueryDto {}

export type { PaginatedResponse } from './paginated-response.dto';

export function toPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      totalItems: total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
