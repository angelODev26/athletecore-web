export interface PageModel<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
}

interface ServerPage<T> {
  content?: T[];
  items?: T[];
  page?: number;
  number?: number;
  pageSize?: number;
  size?: number;
  totalItems?: number;
  totalElements?: number;
}

export function toPageModel<T>(response: T[] | ServerPage<T>, fallbackPage = 0, fallbackPageSize = 20): PageModel<T> {
  if (Array.isArray(response)) {
    return {
      items: response,
      page: fallbackPage,
      pageSize: response.length || fallbackPageSize,
      totalItems: response.length,
    };
  }

  const items = response.content ?? response.items ?? [];
  return {
    items,
    page: response.page ?? response.number ?? fallbackPage,
    pageSize: response.pageSize ?? response.size ?? items.length ?? fallbackPageSize,
    totalItems: response.totalItems ?? response.totalElements ?? items.length,
  };
}
