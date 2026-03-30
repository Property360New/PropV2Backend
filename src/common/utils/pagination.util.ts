// ============================================================
// src/common/utils/pagination.util.ts
// ============================================================
export interface PaginationQuery {
  page?: number;
  limit?: number;
}
 
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
 
export function getPaginationParams(query: PaginationQuery) {
  const page = Math.max(1, query.page ?? 1);
  // Max 500 per page as per requirements
  const limit = Math.min(500, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}
 
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}