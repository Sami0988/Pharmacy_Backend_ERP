import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PaginatedResponse } from './paginated-response.dto';

export async function paginate<T>(params: {
  db: NodePgDatabase<any>;
  baseQuery: any;
  countQuery: any;
  page: number;
  limit: number;
}): Promise<PaginatedResponse<T>> {
  const offset = (params.page - 1) * params.limit;
  const [data, [{ count }]] = await Promise.all([
    params.baseQuery.limit(params.limit).offset(offset),
    params.countQuery,
  ]);
  const totalItems = Number(count);
  const totalPages = Math.ceil(totalItems / params.limit);
  return {
    data,
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPreviousPage: params.page > 1,
    },
  };
}
