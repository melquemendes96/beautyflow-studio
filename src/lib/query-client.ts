import { QueryClient } from "@tanstack/react-query";

/** Cliente compartilhado — queries públicas não refetch agressivo. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
