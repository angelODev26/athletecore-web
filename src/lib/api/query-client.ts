import { QueryClient, type QueryKey } from "@tanstack/react-query";

import { isApiError } from "./errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isApiError(error) && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export function moduleQueryKey(module: string, filters?: unknown): QueryKey {
  return filters === undefined ? [module] : [module, filters];
}
