export interface PageRequest {
  /** 1-based page number. */
  page: number;
  pageSize: number;
}

export interface Page<T> extends PageRequest {
  items: T[];
  total: number;
  totalPages: number;
}

export function toPage<T>(items: T[], total: number, { page, pageSize }: PageRequest): Page<T> {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
